import { Link, useLocation } from "react-router-dom";
import { 
  Home, 
  Package, 
  Clock, 
  Database, 
  Settings, 
  BarChart3,
  Sparkles,
  Zap
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

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    description: "Overview and analytics"
  },
  {
    title: "Harvest Manager",
    url: "/harvest",
    icon: Package,
    description: "Manage card data harvesting"
  },
  {
    title: "Automation",
    url: "/automation",
    icon: Clock,
    description: "Automated sync settings"
  },
  {
    title: "Data Manager",
    url: "/data",
    icon: Zap,
    description: "TCGCSV, JustTCG & Matching"
  },
];

const dataItems = [
  {
    title: "Games",
    url: "/games",
    icon: Database,
    description: "Manage game data"
  },
  {
    title: "Analytics",
    url: "/analytics", 
    icon: BarChart3,
    description: "View data insights"
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
    <Sidebar className="border-r border-sidebar-border w-72">
      <SidebarHeader className="border-b border-sidebar-border px-8 py-5">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <h1 className="font-display font-semibold text-lg text-sidebar-foreground group-hover:text-sidebar-primary transition-colors">
                TCG Manager
              </h1>
              <p className="text-xs text-sidebar-foreground/60">Data & Analytics</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-6 py-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="group">
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          active && "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        )}
                      >
                        <item.icon className={cn(
                          "h-4 w-4 transition-colors",
                          active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"
                        )} />
                        {!collapsed && (
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {item.title}
                            </span>
                            <span className={cn(
                              "text-xs opacity-60",
                              active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                            )}>
                              {item.description}
                            </span>
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
          <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
            Data Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {dataItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="group">
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          active && "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        )}
                      >
                        <item.icon className={cn(
                          "h-4 w-4 transition-colors",
                          active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"
                        )} />
                        {!collapsed && (
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {item.title}
                            </span>
                            <span className={cn(
                              "text-xs opacity-60",
                              active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                            )}>
                              {item.description}
                            </span>
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
      </SidebarContent>
    </Sidebar>
  );
};