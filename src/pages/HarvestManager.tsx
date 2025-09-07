/**
 * Harvest Manager Page
 * 
 * Central hub for managing full-set harvesting operations
 */

import React from 'react';

import { FullSetHarvester } from '@/components/FullSetHarvester';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Package, 
  Database, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

export default function HarvestManager() {
  return (
    <div className="container mx-auto p-8 space-y-8 animate-fade-in max-w-7xl">
        {/* Page Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Set Harvest Manager</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Complete set harvesting with automatic pagination and variant collection.
            Pull every card and every variant with pricing data for comprehensive set coverage.
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="font-medium">Full Coverage</div>
                  <div className="text-sm text-muted-foreground">All cards & variants</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-500" />
                <div>
                  <div className="font-medium">Pagination</div>
                  <div className="text-sm text-muted-foreground">Auto-handles large sets</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-purple-500" />
                <div>
                  <div className="font-medium">Database Sync</div>
                  <div className="text-sm text-muted-foreground">Transactional updates</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-orange-500" />
                <div>
                  <div className="font-medium">Validation</div>
                  <div className="text-sm text-muted-foreground">Quality assurance</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              How Full Set Harvesting Works
            </CardTitle>
            <CardDescription>
              Understanding the complete workflow for harvesting trading card set data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">1</Badge>
                  <div>
                    <div className="font-medium">API Pagination</div>
                    <div className="text-sm text-muted-foreground">
                      Calls <code>/cards?game={`{gameId}`}&set={`{setId}`}</code> with automatic pagination.
                      No printing or condition filters to capture all variants.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">2</Badge>
                  <div>
                    <div className="font-medium">Complete Coverage</div>
                    <div className="text-sm text-muted-foreground">
                      Loops until <code>meta.hasMore === false</code>, incrementing offset by limit each request.
                      Deduplicates cards to prevent double-counting.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">3</Badge>
                  <div>
                    <div className="font-medium">Variant Collection</div>
                    <div className="text-sm text-muted-foreground">
                      Each card includes all variants with distinct printing and condition combinations.
                      Preserves price history and market data.
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">4</Badge>
                  <div>
                    <div className="font-medium">Data Validation</div>
                    <div className="text-sm text-muted-foreground">
                      Validates total card count against API metadata.
                      Checks for multiple variants and data completeness.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">5</Badge>
                  <div>
                    <div className="font-medium">Database Sync</div>
                    <div className="text-sm text-muted-foreground">
                      Transactional updates: cards first, then pricing variants.
                      Updates set and game statistics automatically.
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">6</Badge>
                  <div>
                    <div className="font-medium">Quality Assurance</div>
                    <div className="text-sm text-muted-foreground">
                      Reports validation results, warnings, and comprehensive statistics.
                      Ensures data integrity throughout the process.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Main Harvester Component */}
        <FullSetHarvester />

        {/* Usage Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Examples</CardTitle>
            <CardDescription>
              Common game and set combinations for testing and production use
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Pokémon Base Set</div>
                <div className="text-muted-foreground">Game: pokemon</div>
                <div className="text-muted-foreground">Set: base-set</div>
                <div className="text-xs text-green-600 mt-1">~102 cards</div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Magic Alpha</div>
                <div className="text-muted-foreground">Game: mtg</div>
                <div className="text-muted-foreground">Set: alpha</div>
                <div className="text-xs text-green-600 mt-1">~295 cards</div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Yu-Gi-Oh! LOB</div>
                <div className="text-muted-foreground">Game: yugioh</div>
                <div className="text-muted-foreground">Set: LOB</div>
                <div className="text-xs text-green-600 mt-1">~126 cards</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Performance & Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Recommended
                </div>
                <ul className="list-disc list-inside space-y-1 mt-2 text-muted-foreground">
                  <li>Use page size 100-200 for optimal performance</li>
                  <li>Start with smaller sets for testing</li>
                  <li>Monitor validation warnings closely</li>
                  <li>Use "Harvest Only" for data exploration</li>
                </ul>
              </div>
              
              <div>
                <div className="font-medium text-yellow-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Considerations
                </div>
                <ul className="list-disc list-inside space-y-1 mt-2 text-muted-foreground">
                  <li>Large sets (1000+ cards) may take several minutes</li>
                  <li>Rate limiting applies between page requests</li>
                  <li>Database sync requires authentication</li>
                  <li>Partial failures preserve completed data</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}