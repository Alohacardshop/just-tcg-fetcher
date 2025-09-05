import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Download, 
  Upload, 
  Database, 
  FileText, 
  Play, 
  Pause,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { useState } from "react";

export const DataImportPanel = () => {
  const [apiKey, setApiKey] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState('');

  const importMethods = [
    {
      title: 'Batch Import by IDs',
      description: 'Import specific cards using TCGPlayer IDs, Card IDs, or Variant IDs',
      icon: FileText,
      action: 'Configure',
      color: 'primary'
    },
    {
      title: 'Full Game Import',
      description: 'Import all cards from specific games (MTG, Pokemon, etc.)',
      icon: Database,
      action: 'Start Import',
      color: 'accent'
    },
    {
      title: 'Set-based Import',
      description: 'Import all cards from specific sets',
      icon: Download,
      action: 'Select Sets',
      color: 'rare'
    }
  ];

  const handleStartImport = () => {
    setIsImporting(true);
    // Simulate import progress
    const interval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsImporting(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card className="bg-gradient-card border-border shadow-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">API Configuration</h3>
            <Badge variant={apiKey ? "default" : "secondary"} className="ml-auto">
              {apiKey ? "Connected" : "Not Connected"}
            </Badge>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">JustTCG API Key</label>
              <Input
                type="password"
                placeholder="tcg_your_api_key_here"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 bg-background/50"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get your API key from <a href="https://justtcg.com" className="text-primary hover:underline">justtcg.com</a>
              </p>
            </div>
            
            {apiKey && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-green-500">API key configured successfully</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Import Methods */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {importMethods.map((method) => (
          <Card key={method.title} className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 group shadow-card">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <method.icon className="h-6 w-6 text-primary group-hover:text-accent transition-colors" />
                <div className="space-y-2 flex-1">
                  <h4 className="font-semibold text-foreground">{method.title}</h4>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                </div>
              </div>
              
              <Button 
                className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20"
                disabled={!apiKey}
              >
                {method.action}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Batch Import Configuration */}
      <Card className="bg-gradient-card border-border shadow-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Batch Import Configuration</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Card IDs (one per line)</label>
              <Textarea
                placeholder={`Enter TCGPlayer IDs, Card IDs, or Variant IDs:\n123456\n789012\nabc-def-123`}
                value={selectedIds}
                onChange={(e) => setSelectedIds(e.target.value)}
                className="mt-1 bg-background/50 min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum 100 IDs for paid plans, 20 for free plan
              </p>
            </div>
            
            {isImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Import Progress</span>
                  <span className="text-sm text-muted-foreground">{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}
            
            <div className="flex gap-3">
              {!isImporting ? (
                <Button 
                  onClick={handleStartImport}
                  disabled={!apiKey || !selectedIds.trim()}
                  className="bg-gradient-legendary text-accent-foreground shadow-glow"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Import
                </Button>
              ) : (
                <Button variant="secondary">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Import
                </Button>
              )}
              
              <Button variant="secondary" disabled={!selectedIds.trim()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Import Status */}
      {importProgress > 0 && (
        <Card className="bg-gradient-card border-border shadow-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {importProgress === 100 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-accent" />
              )}
              <h3 className="text-lg font-semibold">
                {importProgress === 100 ? "Import Complete" : "Import in Progress"}
              </h3>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-accent">42</div>
                <div className="text-xs text-muted-foreground">Cards Imported</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">38</div>
                <div className="text-xs text-muted-foreground">Successful</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">4</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};