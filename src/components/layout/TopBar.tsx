import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Menu, 
  Search, 
  Bell, 
  User, 
  LogOut, 
  Settings,
  Github,
  Sparkles,
  Activity,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const TopBar = () => {
  const { user, signOut } = useAuth();
  const { toggleSidebar } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-elegant">
      <div className="flex h-18 items-center justify-between px-8">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="h-10 w-10 p-0 rounded-xl hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:shadow-card transition-all duration-300"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <div className="relative hidden md:block w-96">
            <div className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" />
            </div>
            <Input
              placeholder="Search games, sets, cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-3 bg-gradient-surface/50 border-border/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/50 rounded-xl shadow-card backdrop-blur-sm transition-all duration-300"
            />
            {searchQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted/50 rounded-lg"
                  onClick={() => setSearchQuery("")}
                >
                  ×
                </Button>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="hidden lg:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-xs font-medium hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:shadow-card rounded-lg transition-all duration-300"
            >
              <Zap className="h-3 w-3 mr-1.5" />
              Quick Sync
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* System Status */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-gradient-surface/50 rounded-lg border border-border/50">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">Online</span>
          </div>

          {/* Notifications */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 relative rounded-xl hover:bg-gradient-to-r hover:from-accent/10 hover:to-transparent hover:shadow-card transition-all duration-300"
          >
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs bg-gradient-accent border-accent/20 text-white">
              3
            </Badge>
          </Button>

          {/* GitHub */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 rounded-xl hover:bg-gradient-to-r hover:from-muted/20 hover:to-transparent hover:shadow-card transition-all duration-300"
          >
            <Github className="h-4 w-4" />
          </Button>

          {/* User Menu */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-10 w-10 p-0 rounded-xl hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:shadow-card transition-all duration-300 ring-2 ring-primary/20"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-64 p-2 bg-background/95 backdrop-blur-xl border-border/50 shadow-elegant rounded-xl"
              >
                <DropdownMenuLabel className="font-normal p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
                      <User className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold leading-none">Account</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/50" />
                
                <DropdownMenuItem className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-muted/20 hover:to-transparent transition-all duration-200">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-muted/20 hover:to-transparent transition-all duration-200">
                  <Activity className="mr-2 h-4 w-4" />
                  <span>Activity</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="bg-border/50" />
                
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="p-2 rounded-lg hover:bg-gradient-to-r hover:from-destructive/10 hover:to-transparent hover:text-destructive transition-all duration-200"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};