import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthUser } from "@/lib/auth";

type RequireAuthProps = {
  children: ReactNode;
  roles?: AuthUser["role"][];
  redirectTo?: string;
};

const RequireAuth = ({ children, roles, redirectTo = "/browse" }: RequireAuthProps) => {
  const { user, isAuthenticated, isHydrated } = useAuth();
  const location = useLocation();

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
