import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Database, Download } from "lucide-react";

export const Header = () => {
  return (
    <header className="relative overflow-hidden bg-gradient-subtle border-b border-border">
      <div className="container mx-auto px-6 py-12">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-8 w-8 text-accent" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              TCG Data Manager
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Pull real-time trading card data from JustTCG API and manage your collection database with ease
          </p>
          
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow">
              <Database className="h-5 w-5 mr-2" />
              Connect Database
            </Button>
            <Button variant="secondary" size="lg">
              <Download className="h-5 w-5 mr-2" />
              Import Data
            </Button>
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-gradient-primary rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-48 h-48 bg-gradient-legendary rounded-full blur-3xl"></div>
      </div>
    </header>
  );
};