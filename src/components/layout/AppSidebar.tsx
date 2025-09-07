import { Link, useLocation } from "react-router-dom";
import { 
  Home, 
  Package, 
  Clock, 
  Database, 
  Settings, 
  BarChart3,
  Sparkles,
  Zap,
  ChevronRight
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    description: "Overview and analytics",
    badge: null
  },
  {
    title: "Harvest Manager",
    url: "/harvest",
    icon: Package,
    description: "Manage card data harvesting",
    badge: null
  },
  {
    title: "Automation",
    url: "/automation",
    icon: Clock,
    description: "Automated sync settings",
    badge: "Pro"
  },
  {
    title: "Data Manager",
    url: "/data",
    icon: Zap,
    description: "TCGCSV, JustTCG & Matching",
    badge: "New"
  },
];

const dataItems = [
  {
    title: "Games",
    url: "/games",
    icon: Database,
    description: "Manage game data",
    badge: null
  },
  {
    title: "Analytics",
    url: "/analytics", 
    icon: BarChart3,
    description: "View data insights",
    badge: null
  },
];

export const AppSidebar = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className="border-r border-border/50 bg-gradient-surface/80 backdrop-blur-xl shadow-elegant">
      <SidebarHeader className="border-b border-border/50 px-6 py-6 bg-gradient-to-r from-primary/5 to-transparent">
        <Link to="/" className="flex items-center gap-3 group transition-all duration-300">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow ring-2 ring-primary/20 transition-all duration-300 group-hover:shadow-glow group-hover:scale-105">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-accent to-rare rounded-full border-2 border-background animate-pulse" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <h1 className="font-display font-bold text-xl text-foreground group-hover:text-primary transition-colors">
                TCG Manager
              </h1>
              <p className="text-xs text-muted-foreground font-medium">Data & Analytics Platform</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-4 py-6 space-y-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-primary rounded-full" />
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {menuItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="group">
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:shadow-card",
                          active && "bg-gradient-primary text-white shadow-glow ring-1 ring-primary/20"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "flex-shrink-0 p-1.5 rounded-lg transition-all duration-300",
                            active 
                              ? "bg-white/20 text-white" 
                              : "bg-muted/50 text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                          )}>
                            <item.icon className="h-4 w-4" />
                          </div>
                          {!collapsed && (
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm truncate">
                                {item.title}
                              </span>
                              <span className={cn(
                                "text-xs opacity-80 truncate",
                                active ? "text-white/80" : "text-muted-foreground"
                              )}>
                                {item.description}
                              </span>
                            </div>
                          )}
                        </div>
                        {!collapsed && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.badge && (
                              <Badge 
                                variant="secondary" 
                                className={cn(
                                  "text-xs px-2 py-0.5",
                                  item.badge === "New" && "bg-gradient-accent text-white border-accent/20",
                                  item.badge === "Pro" && "bg-gradient-rare text-white border-rare/20"
                                )}
                              >
                                {item.badge}
                              </Badge>
                            )}
                            <ChevronRight className={cn(
                              "h-3 w-3 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5",
                              active ? "text-white/80" : "text-muted-foreground"
                            )} />
                          </div>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-accent rounded-full" />
            Data Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {dataItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="group">
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-accent/10 hover:to-transparent hover:shadow-card",
                          active && "bg-gradient-accent text-white shadow-glow ring-1 ring-accent/20"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "flex-shrink-0 p-1.5 rounded-lg transition-all duration-300",
                            active 
                              ? "bg-white/20 text-white" 
                              : "bg-muted/50 text-muted-foreground group-hover:bg-accent/20 group-hover:text-accent"
                          )}>
                            <item.icon className="h-4 w-4" />
                          </div>
                          {!collapsed && (
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm truncate">
                                {item.title}
                              </span>
                              <span className={cn(
                                "text-xs opacity-80 truncate",
                                active ? "text-white/80" : "text-muted-foreground"
                              )}>
                                {item.description}
                              </span>
                            </div>
                          )}
                        </div>
                        {!collapsed && (
                          <ChevronRight className={cn(
                            "h-3 w-3 transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5",
                            active ? "text-white/80" : "text-muted-foreground"
                          )} />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      {!collapsed && (
        <div className="mt-auto px-6 py-4 border-t border-border/50 bg-gradient-to-r from-muted/20 to-transparent">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span>System Online</span>
          </div>
        </div>
      )}
    </Sidebar>
  );
};