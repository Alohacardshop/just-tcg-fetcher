import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TabsDataSources } from '@/components/admin/TabsDataSources';
import { 
  Download, 
  Database, 
  Zap, 
  Settings, 
  ExternalLink,
  BarChart3,
  Shield,
  Server,
  Users,
  HardDrive,
  Info
} from 'lucide-react';

const DataManager = () => {
  return (
    <div className="container mx-auto p-8 space-y-8 animate-fade-in max-w-7xl">
      <div className="space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Data Manager
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Comprehensive data management hub for TCGCSV synchronization, JustTCG imports, 
            AI-powered matching, and system administration.
          </p>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="data-sources" className="space-y-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="data-sources" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Data Sources
            </TabsTrigger>
            <TabsTrigger value="matching" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Matching
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data-sources" className="space-y-6">
            <TabsDataSources />
          </TabsContent>

          <TabsContent value="matching" className="space-y-6">
            <Tabs defaultValue="smart-match" className="space-y-6">
              <TabsList>
                <TabsTrigger value="smart-match">Smart Match</TabsTrigger>
                <TabsTrigger value="results">Browse Results</TabsTrigger>
              </TabsList>

              <TabsContent value="smart-match">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      AI-Powered Smart Matching
                    </CardTitle>
                    <CardDescription>
                      Automatically match cards between JustTCG and TCGCSV data sources using advanced algorithms
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Smart matching is currently unavailable. Database tables need to be created first.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="results">
                <Card>
                  <CardHeader>
                    <CardTitle>Matching Results History</CardTitle>
                    <CardDescription>
                      Browse past matching operations and their results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Matching results are currently unavailable. Database tables need to be created first.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="admin" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Edge Function Logs
                  </CardTitle>
                  <CardDescription>
                    Monitor and troubleshoot edge function executions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    View Edge Functions <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Database Management
                  </CardTitle>
                  <CardDescription>
                    Access database tables, queries, and schema management
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/editor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Open Database Editor <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Authentication
                  </CardTitle>
                  <CardDescription>
                    Manage user authentication, providers, and security settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/auth/users"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Manage Users <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Storage
                  </CardTitle>
                  <CardDescription>
                    File storage, buckets, and asset management
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/storage/buckets"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Storage Buckets <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DataManager;