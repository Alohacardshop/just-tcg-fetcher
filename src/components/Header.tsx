import { Button } from "@/components/ui/button";
import { Sparkles, Github, LogOut, User, Package, Clock, Home, Database } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "react-router-dom";

export const Header = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="bg-card border-b border-border shadow-card">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary shadow-glow" />
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                TCG Data Manager
              </h1>
            </Link>
            
            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-4">
              <Link
                to="/"
                className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                  location.pathname === '/' ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
              <Link
                to="/harvest"
                className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                  location.pathname === '/harvest' ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Package className="h-4 w-4" />
                Harvest Manager
              </Link>
              <Link
                to="/automation"
                className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                  location.pathname === '/automation' ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Clock className="h-4 w-4" />
                Automation
              </Link>
              <Link
                to="/data"
                className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                  location.pathname === '/data' ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Database className="h-4 w-4" />
                Data Manager
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>{user.email}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSignOut}
                  className="border-border hover:bg-accent/50"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}
            <Button 
              variant="outline" 
              size="sm"
              className="border-border hover:bg-accent/50"
            >
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};