param(
  [switch]$ProdOnly,
  [switch]$StagingOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($ProdOnly -and $StagingOnly) {
  throw "Use only one of -ProdOnly or -StagingOnly."
}

function Add-Result {
  param(
    [System.Collections.Generic.List[object]]$Results,
    [string]$Target,
    [string]$Check,
    [bool]$Passed,
    [string]$Details
  )

  $entry = [PSCustomObject]@{
    Target  = $Target
    Check   = $Check
    Passed  = $Passed
    Details = $Details
  }
  $Results.Add($entry) | Out-Null
  if ($Passed) {
    Write-Host "[PASS] [$Target] $Check - $Details"
  } else {
    Write-Host "[FAIL] [$Target] $Check - $Details" -ForegroundColor Red
  }
}

function Get-StatusCode {
  param(
    [string]$Url,
    [string]$Method = "GET",
    [string]$Body = ""
  )

  try {
    if ($Method -eq "POST") {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 30
      return [int]$response.StatusCode
    }

    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 30
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode.value__
    }
    throw
  }
}

function Test-PaymentVerifyBundle {
  param([string]$Domain)

  $baseUrl = "https://$Domain"
  $verifyUrl = "$baseUrl/payment/verify?provider=flutterwave&return_to=mobile"
  $html = (Invoke-WebRequest -UseBasicParsing -Uri $verifyUrl -TimeoutSec 30).Content

  $indexMatch = [regex]::Match($html, '/assets/index-[^"'']+\.js')
  if (-not $indexMatch.Success) {
    return [PSCustomObject]@{
      Ok      = $false
      Details = "Could not find index chunk path in HTML."
    }
  }

  $indexPath = $indexMatch.Value
  $indexJs = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $indexPath) -TimeoutSec 30).Content

  $paymentMatch = [regex]::Match($indexJs, "PaymentVerify-[A-Za-z0-9_-]+\.js")
  if (-not $paymentMatch.Success) {
    return [PSCustomObject]@{
      Ok      = $false
      Details = "Could not find PaymentVerify chunk reference in index JS ($indexPath)."
    }
  }

  $paymentPath = "/assets/$($paymentMatch.Value)"
  $paymentJs = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $paymentPath) -TimeoutSec 30).Content
  $hasDeepLink = $paymentJs -match "servfix://payment/verify"
  $hasReturnTo = $paymentJs -match "return_to"

  return [PSCustomObject]@{
    Ok      = ($hasDeepLink -and $hasReturnTo)
    Details = "index=$indexPath payment=$paymentPath deepLink=$hasDeepLink returnTo=$hasReturnTo"
  }
}

$targets = @(
  @{
    Name      = "staging"
    StackName = "ServfixStaging"
    Domain    = "staging.servfixgh.com"
    Cluster   = "ServfixStaging-ClusterEB0386A7-IGsrdTzU8CTq"
    Service   = "ServfixStaging-Service9571FDD8-gOEomt7tOgv9"
  },
  @{
    Name      = "prod"
    StackName = "ServfixProd"
    Domain    = "www.servfixgh.com"
    Cluster   = "ServfixProd-ClusterEB0386A7-5FsHCd5pVCRJ"
    Service   = "ServfixProd-Service9571FDD8-iQkdyUEBv0nw"
  }
)

if ($ProdOnly) {
  $targets = @($targets | Where-Object { $_.Name -eq "prod" })
}

if ($StagingOnly) {
  $targets = @($targets | Where-Object { $_.Name -eq "staging" })
}

$results = [System.Collections.Generic.List[object]]::new()

foreach ($target in $targets) {
  $name = $target.Name
  $stackName = $target.StackName
  $domain = $target.Domain
  $cluster = $target.Cluster
  $serviceName = $target.Service

  $stackJson = aws cloudformation describe-stacks --stack-name $stackName --output json | ConvertFrom-Json
  $stack = $stackJson.Stacks[0]
  Add-Result -Results $results -Target $name -Check "CloudFormation status" -Passed ($stack.StackStatus -eq "UPDATE_COMPLETE") -Details "$($stack.StackStatus) @ $($stack.LastUpdatedTime)"

  $serviceJson = aws ecs describe-services --cluster $cluster --services $serviceName --output json | ConvertFrom-Json
  $service = $serviceJson.services[0]
  $serviceHealthy = $service.status -eq "ACTIVE" -and $service.desiredCount -eq $service.runningCount
  Add-Result -Results $results -Target $name -Check "ECS service health" -Passed $serviceHealthy -Details "status=$($service.status) desired=$($service.desiredCount) running=$($service.runningCount) taskDef=$($service.taskDefinition)"

  $taskDefArn = $service.taskDefinition
  $taskDefJson = aws ecs describe-task-definition --task-definition $taskDefArn --output json | ConvertFrom-Json
  $image = $taskDefJson.taskDefinition.containerDefinitions[0].image
  Add-Result -Results $results -Target $name -Check "ECS image tag" -Passed ([bool]$image) -Details $image

  $healthCode = Get-StatusCode -Url "https://$domain/api/health"
  Add-Result -Results $results -Target $name -Check "API health endpoint" -Passed ($healthCode -eq 200) -Details "status=$healthCode"

  $mobileLoginCode = Get-StatusCode -Url "https://$domain/api/auth/mobile/login" -Method "POST" -Body "{}"
  $mobileLoginOk = $mobileLoginCode -in @(400, 401)
  Add-Result -Results $results -Target $name -Check "Mobile login route exists" -Passed $mobileLoginOk -Details "status=$mobileLoginCode (expected 400/401, never 404)"

  $adminMfaCode = Get-StatusCode -Url "https://$domain/api/auth/mobile/admin-mfa/verify" -Method "POST" -Body "{}"
  Add-Result -Results $results -Target $name -Check "Admin blocked on mobile route" -Passed ($adminMfaCode -eq 403) -Details "status=$adminMfaCode"

  $bundleCheck = Test-PaymentVerifyBundle -Domain $domain
  Add-Result -Results $results -Target $name -Check "Payment return deep-link bundle" -Passed $bundleCheck.Ok -Details $bundleCheck.Details
}

$failed = @($results | Where-Object { -not $_.Passed })
Write-Host ""
if ($failed.Count -gt 0) {
  Write-Host "Pre-release checks failed: $($failed.Count)" -ForegroundColor Red
  exit 1
}

Write-Host "All pre-release checks passed." -ForegroundColor Green
exit 0
