import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import MainPage from "./pages/MainPage";
import PendingActivationPage from "./pages/PendingActivationPage";
import { useMe } from "./hooks/useMe";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isDevMode } = useAuth();
  const { profile, loading: meLoading } = useMe();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  if (!isDevMode && meLoading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }

  if (!isDevMode && profile && !profile.isActivated && profile.role !== "system") {
    return <PendingActivationPage />;
  }

  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthFlowRoute({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="gmv-light-ui min-h-screen">
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><SignUpPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<AuthFlowRoute><ForgotPasswordPage /></AuthFlowRoute>} />
        <Route path="/reset-password" element={<AuthFlowRoute><ForgotPasswordPage /></AuthFlowRoute>} />
        <Route path="/" element={<ProtectedRoute><MainPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}
