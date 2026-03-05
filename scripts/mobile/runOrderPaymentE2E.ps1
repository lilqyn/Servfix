param(
  [string]$DeviceId = "",
  [string]$AppId = "com.servfix.app",
  [string]$Scheme = "servfix",
  [switch]$InstallDebug,
  [int]$DevServerPort = 8082
)

$ErrorActionPreference = "Stop"

function Resolve-AdbPath {
  $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
  if ($adbCommand) {
    return $adbCommand.Source
  }

  $wingetAdb = "C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
  if (Test-Path $wingetAdb) {
    return $wingetAdb
  }

  throw "adb was not found in PATH and no known platform-tools path was detected."
}

function Get-ConnectedDeviceIds {
  param([string]$AdbPath)

  $lines = & $AdbPath devices
  $rows = @($lines | Select-Object -Skip 1 | Where-Object { $_ -match "\S+\s+device$" })
  $ids = @($rows | ForEach-Object { ($_ -split "\s+")[0] })
  return ,$ids
}

function Ensure-AndroidEnv {
  if (-not $env:JAVA_HOME) {
    $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path (Join-Path $studioJbr "bin\java.exe")) {
      $env:JAVA_HOME = $studioJbr
    }
  }

  if (-not $env:ANDROID_HOME) {
    $sdkCandidate = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $sdkCandidate) {
      $env:ANDROID_HOME = $sdkCandidate
    }
  }

  if (-not $env:ANDROID_SDK_ROOT -and $env:ANDROID_HOME) {
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  }

  if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    throw "JAVA_HOME is missing or invalid. Set JAVA_HOME before running with -InstallDebug."
  }

  if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    throw "ANDROID_HOME is missing or invalid. Set ANDROID_HOME before running with -InstallDebug."
  }
}

function Install-DebugBuild {
  param([int]$Port)

  Ensure-AndroidEnv

  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
  $gradle = Join-Path $repoRoot "mobile\app\android\gradlew.bat"

  if (-not (Test-Path $gradle)) {
    throw "Could not find gradle wrapper at $gradle"
  }

  Write-Host "Installing debug build on device..."
  & $gradle "app:installDebug" "-PreactNativeDevServerPort=$Port"
}

function Start-DeepLink {
  param(
    [string]$AdbPath,
    [string]$TargetDevice,
    [string]$Url,
    [switch]$StopAppFirst
  )

  $shellSafeUrl = $Url -replace "&", "\&"
  $args = @("-s", $TargetDevice, "shell", "am", "start")
  if ($StopAppFirst) {
    $args += "-S"
  }
  $args += @("-W", "-a", "android.intent.action.VIEW", "-d", $shellSafeUrl)
  & $AdbPath @args
}

$adbPath = Resolve-AdbPath
$deviceIds = @(Get-ConnectedDeviceIds -AdbPath $adbPath)

if ($deviceIds.Count -eq 0) {
  throw "No Android device/emulator detected. Start an emulator or connect a device."
}

$targetDevice = $DeviceId
if (-not $targetDevice) {
  $targetDevice = $deviceIds[0]
}

if ($deviceIds -notcontains $targetDevice) {
  throw "Requested device '$targetDevice' is not connected. Connected devices: $($deviceIds -join ', ')"
}

Write-Host "Using adb: $adbPath"
Write-Host "Using device: $targetDevice"

if ($InstallDebug) {
  Install-DebugBuild -Port $DevServerPort
}

$packageLine = & $adbPath -s $targetDevice shell pm list packages $AppId
if ($packageLine -notmatch [regex]::Escape("package:$AppId")) {
  Write-Warning "App '$AppId' is not installed on $targetDevice."
} else {
  Write-Host "App '$AppId' is installed."
}

$cancelledUrl = "${Scheme}://payment/verify?provider=paystack&status=cancelled"
$orderPaymentUrl = "${Scheme}://payment/verify?provider=paystack&purpose=order_payment&payment_intent_id=11111111-1111-1111-1111-111111111111&reference=demo_ref_1"

Write-Host ""
Write-Host "Deep-link smoke checks..."
Start-DeepLink -AdbPath $adbPath -TargetDevice $targetDevice -Url $cancelledUrl -StopAppFirst
Start-Sleep -Milliseconds 500
Start-DeepLink -AdbPath $adbPath -TargetDevice $targetDevice -Url $orderPaymentUrl -StopAppFirst

Write-Host ""
Write-Host "Latest payment intent from ActivityManager:"
& $adbPath -s $targetDevice shell dumpsys activity activities |
  Select-String -Pattern "Intent \{ act=android.intent.action.VIEW dat=${Scheme}://payment/verify"

Write-Host ""
Write-Host "Manual E2E checklist:"
Write-Host "1. Open the app and sign in as a buyer account."
Write-Host "2. Open an order with a pending stage payment."
Write-Host "3. Tap 'Pay initial amount' or 'Payable amount'."
Write-Host "4. Complete provider checkout in browser."
Write-Host "5. Confirm return screen shows success, then tap 'View orders'."
Write-Host "6. Confirm the order list refreshes immediately and payment state updates."
