import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoriesCard } from './tcgcsv/CategoriesCard';
import { GroupsCard } from './tcgcsv/GroupsCard';
import { ProductsBulkCard } from './tcgcsv/ProductsBulkCard';
import { DataImportPanel } from '../DataImportPanel';

export const TabsDataSources = () => {
  const [activeTab, setActiveTab] = useState('tcgcsv');

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

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="tcgcsv">TCGCSV</TabsTrigger>
        <TabsTrigger value="justtcg">JustTCG</TabsTrigger>
      </TabsList>

      <TabsContent value="tcgcsv" className="space-y-6">
        <div className="space-y-6">
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