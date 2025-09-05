import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X } from "lucide-react";
import { useState } from "react";

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
  games: Array<{ id: string; name: string; game_id: string }>;
}

interface SearchFilters {
  query: string;
  game: string;
  condition: string;
  printing: string;
}

export const SearchFilters = ({ onSearch, games }: SearchFiltersProps) => {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    game: '',
    condition: '',
    printing: ''
  });

  const conditions = [
    { value: 'NM', label: 'Near Mint' },
    { value: 'LP', label: 'Lightly Played' },
    { value: 'MP', label: 'Moderately Played' },
    { value: 'HP', label: 'Heavily Played' },
    { value: 'DMG', label: 'Damaged' },
    { value: 'S', label: 'Sealed' }
  ];

  const printings = [
    { value: 'Normal', label: 'Normal' },
    { value: 'Foil', label: 'Foil' }
  ];

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  };

  const handleSearch = () => {
    onSearch(filters);
  };

  const clearFilters = () => {
    const clearedFilters = { query: '', game: '', condition: '', printing: '' };
    setFilters(clearedFilters);
    onSearch(clearedFilters);
  };

  const activeFiltersCount = Object.values(filters).filter(value => value).length;

  return (
    <div className="bg-gradient-card border border-border rounded-lg p-6 space-y-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Search & Filter</h3>
        </div>
        {activeFiltersCount > 0 && (
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {activeFiltersCount} active
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Card Name</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cards..."
              value={filters.query}
              onChange={(e) => updateFilter('query', e.target.value)}
              className="pl-10 bg-background/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Game</label>
          <Select value={filters.game} onValueChange={(value) => updateFilter('game', value)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="All games" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All games</SelectItem>
              {games.map((game) => (
                <SelectItem key={game.game_id} value={game.game_id}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Condition</label>
          <Select value={filters.condition} onValueChange={(value) => updateFilter('condition', value)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Any condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any condition</SelectItem>
              {conditions.map((condition) => (
                <SelectItem key={condition.value} value={condition.value}>
                  {condition.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Printing</label>
          <Select value={filters.printing} onValueChange={(value) => updateFilter('printing', value)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Any printing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any printing</SelectItem>
              {printings.map((printing) => (
                <SelectItem key={printing.value} value={printing.value}>
                  {printing.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSearch} className="bg-gradient-primary text-primary-foreground shadow-glow">
          <Search className="h-4 w-4 mr-2" />
          Search Cards
        </Button>
        {activeFiltersCount > 0 && (
          <Button variant="secondary" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
};