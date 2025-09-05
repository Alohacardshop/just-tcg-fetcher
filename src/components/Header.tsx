import { Button } from "@/components/ui/button";
import { Sparkles, Github, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Header = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="bg-card border-b border-border shadow-card">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary shadow-glow" />
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                TCG Data Manager
              </h1>
            </div>
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