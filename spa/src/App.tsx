import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import TransferPage from "@/pages/TransferPage";
import PendingPage from "@/pages/PendingPage";
import { Send, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )
      }
    >
      {children}
    </NavLink>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Fintoc Transfers</h1>
            <nav className="flex items-center gap-2">
              <NavItem to="/">
                <Send className="h-4 w-4" />
                Transfer
              </NavItem>
              <NavItem to="/pending">
                <ClipboardList className="h-4 w-4" />
                Pending
              </NavItem>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<TransferPage />} />
            <Route path="/pending" element={<PendingPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App
