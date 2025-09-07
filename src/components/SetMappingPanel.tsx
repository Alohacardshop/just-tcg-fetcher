import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Link, ExternalLink, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SetMappingPanelProps {
  selectedGame: string;
}

export const SetMappingPanel = ({ selectedGame }: SetMappingPanelProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [mappingStatus, setMappingStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');

  // Get JustTCG sets for selected game
  const { data: justTcgSets } = useQuery({
    queryKey: ['justtcg-sets', selectedGame],
    queryFn: async () => {
      if (!selectedGame) return [];
      
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .eq('game_id', selectedGame)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGame,
  });

  // Get TCGCSV groups for the game's category
  const { data: tcgcsvGroups } = useQuery({
    queryKey: ['tcgcsv-groups-for-game', selectedGame],
    queryFn: async () => {
      if (!selectedGame) return [];
      
      // First get the game's TCGCSV category
      const { data: gameData } = await supabase
        .from('games')
        .select('tcgcsv_category_id')
        .eq('id', selectedGame)
        .single();
      
      if (!gameData?.tcgcsv_category_id) return [];
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .select('*')
        .eq('tcgcsv_category_id', gameData.tcgcsv_category_id)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGame,
  });

  // Filter and combine data
  const combinedSets = justTcgSets?.map(jtSet => {
    const mappedGroup = tcgcsvGroups?.find(group => group.group_id === jtSet.tcgcsv_group_id);
    return {
      ...jtSet,
      mappedGroup,
      isMapped: !!mappedGroup
    };
  }) || [];

  const filteredSets = combinedSets.filter(set => {
    const matchesSearch = set.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = mappingStatus === 'all' || 
      (mappingStatus === 'mapped' && set.isMapped) ||
      (mappingStatus === 'unmapped' && !set.isMapped);
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: combinedSets.length,
    mapped: combinedSets.filter(s => s.isMapped).length,
    unmapped: combinedSets.filter(s => !s.isMapped).length
  };

  const handleManualMapping = async (setId: string, groupId: string) => {
    const { error } = await supabase
      .from('sets')
      .update({ tcgcsv_group_id: groupId })
      .eq('id', setId);
    
    if (!error) {
      // Refresh data
      // This would trigger a refetch
    }
  };

  if (!selectedGame) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Link className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-muted-foreground">Select a game to view set mappings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          JustTCG Sets ↔ TCGCSV Groups Mapping
        </CardTitle>
        <CardDescription>
          View and manage connections between JustTCG sets and TCGCSV groups (which represent sets/expansions)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-3">
            <div className="text-center">
              <div className="text-xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Sets</div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">{stats.mapped}</div>
              <div className="text-xs text-muted-foreground">Mapped</div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-center">
              <div className="text-xl font-bold text-red-600">{stats.unmapped}</div>
              <div className="text-xs text-muted-foreground">Unmapped</div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={mappingStatus} onValueChange={(value: any) => setMappingStatus(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sets ({stats.total})</SelectItem>
              <SelectItem value="mapped">Mapped ({stats.mapped})</SelectItem>
              <SelectItem value="unmapped">Unmapped ({stats.unmapped})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sets List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredSets.map((set) => (
            <Card key={set.id} className={`p-4 ${set.isMapped ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{set.name}</h4>
                    {set.isMapped ? (
                      <Badge variant="default" className="text-xs bg-green-600">Mapped</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Unmapped</Badge>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>JustTCG ID: {set.jt_set_id}</div>
                    {set.release_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(set.release_date).toLocaleDateString()}
                      </div>
                    )}
                    <div>Cards: {set.cards_synced_count || 0} synced</div>
                  </div>
                  
                  {set.mappedGroup && (
                    <div className="mt-2 p-2 bg-background rounded border">
                      <div className="text-xs font-medium text-green-700">
                        → Mapped to: {set.mappedGroup.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        TCGCSV Group ID: {set.mappedGroup.group_id}
                      </div>
                    </div>
                  )}
                </div>

                {!set.isMapped && tcgcsvGroups && tcgcsvGroups.length > 0 && (
                  <div className="ml-4">
                    <Select onValueChange={(groupId) => handleManualMapping(set.id, groupId)}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Map to group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tcgcsvGroups.map((group) => (
                          <SelectItem key={group.group_id} value={group.group_id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {filteredSets.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sets found matching your criteria</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};