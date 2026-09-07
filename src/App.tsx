import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { Dashboard } from "@/components/Dashboard";

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  return session ? <Dashboard /> : <AuthScreen />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
