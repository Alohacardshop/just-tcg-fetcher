import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useEdgeFn } from '@/hooks/useEdgeFn';
import { CategoriesCard } from './tcgcsv/CategoriesCard';
import { GroupsCard } from './tcgcsv/GroupsCard';
import { ProductsBulkCard } from './tcgcsv/ProductsBulkCard';
import { DataImportPanel } from '../DataImportPanel';

export const TabsDataSources = () => {
  const [activeTab, setActiveTab] = useState('tcgcsv');
  const { invoke: clearData, loading: clearing } = useEdgeFn('clear-tcgcsv-data');

  // Persist tab selection in localStorage
  useEffect(() => {
    const savedTab = localStorage.getItem('data-sources-tab');
    if (savedTab && (savedTab === 'tcgcsv' || savedTab === 'justtcg')) {
      setActiveTab(savedTab);
    }
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem('data-sources-tab', value);
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear ALL TCGCSV data? This action cannot be undone.')) {
      return;
    }

    try {
      await clearData({}, { suppressToast: true });
      toast({
        title: "Data cleared successfully",
        description: "All TCGCSV data has been cleared. You can now sync fresh data.",
      });
    } catch (error) {
      // Error toast already handled by useEdgeFn
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="tcgcsv">TCGCSV</TabsTrigger>
        <TabsTrigger value="justtcg">JustTCG</TabsTrigger>
      </TabsList>

      <TabsContent value="tcgcsv" className="space-y-6">
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleClearData}
              disabled={clearing}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {clearing ? 'Clearing...' : 'Clear All TCGCSV Data'}
            </Button>
          </div>
          <CategoriesCard />
          <GroupsCard />
          <ProductsBulkCard />
        </div>
      </TabsContent>

      <TabsContent value="justtcg" className="space-y-6">
        <DataImportPanel />
      </TabsContent>
    </Tabs>
  );
};