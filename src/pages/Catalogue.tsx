import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product } from '../db/database';
import { Search, Filter, AlertTriangle, AlertCircle, ShoppingCart } from 'lucide-react';
import { CATEGORIES_PRODUITS } from '../config/constants';
import { showToast } from '../components/ui/Toast';

interface CatalogueProps {
  cart: (Product & { qty: number })[];
  addToCart: (product: Product) => void;
}

export const Catalogue = ({ cart, addToCart }: CatalogueProps) => {
  const products = useLiveQuery(() => db.inventory.toArray()) || [];

  // Extract unique categories from actual database products & fallback to defaults
  const dbCategories = useMemo(() => {
    const unique = new Set<string>();
    products.forEach(p => {
      if (p.category) unique.add(p.category);
    });
    // Add default hardcoded ones to ensure they always exist as base suggestions
    CATEGORIES_PRODUITS.forEach(cat => unique.add(cat));
    return Array.from(unique);
  }, [products]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in_stock' | 'finished' | 'raw'>('all');
  const [selectedCategory, setSelectedCategory] = useState('');

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory ? p.category === selectedCategory : true;

      let matchesType = false;
      const stock = Number(p.stock || 0);
      const type = p.type || 'finished';

      if (typeFilter === 'all') {
        matchesType = true;
      } else if (typeFilter === 'in_stock') {
        matchesType = type === 'finished' && stock >= 1;
      } else {
        matchesType = type === typeFilter;
      }

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [products, searchTerm, typeFilter, selectedCategory]);

  // Group by category
  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((acc, p) => {
      const key = p.category || 'Autres';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  const handleTileClick = (p: Product) => {
    if (p.type === 'raw') {
      showToast('Ce produit est une matière première et ne peut pas être vendu ici.', 'warning');
      return;
    }
    
    // Check if quantity in cart exceeds available stock
    const cartItem = cart.find((item: any) => item.id === p.id);
    if (cartItem && cartItem.qty >= p.stock) {
      showToast(`Stock insuffisant pour ajouter plus de ${p.name} (Stock: ${p.stock}).`, 'warning');
      return;
    }
    
    addToCart(p);
  };

  const getStockColorClass = (stock: number) => {
    if (stock <= 0) return 'text-red-500 font-semibold';
    if (stock < 5) return 'text-yellow-600 font-semibold dark:text-yellow-500';
    return 'text-brand font-medium dark:text-emerald-400';
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Search and Filters panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher dans le catalogue..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-input pl-10 py-2 text-sm bg-slate-50 dark:bg-slate-950 border-slate-200 shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="">Toutes les catégories</option>
              {dbCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">Tous les produits</option>
              <option value="in_stock">En stock uniquement</option>
              <option value="finished">Produits finis</option>
              <option value="raw">Matières premières</option>
            </select>
          </div>
        </div>

      </div>

      {/* Product tiles list */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">Aucun produit trouvé</h3>
          <p className="text-xs text-slate-400">Essayez d'élargir vos filtres ou termes de recherche.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.keys(groupedProducts).sort().map(category => (
            <div key={category} className="flex flex-col gap-3">
              
              {/* Category banner */}
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200/60 dark:border-slate-800/80 pb-1 mt-2">
                {category}
              </h3>

              {/* Tiles grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                {groupedProducts[category].sort((a,b) => a.name.localeCompare(b.name)).map(p => {
                  const inCartQty = cart.find((item: any) => item.id === p.id)?.qty || 0;
                  const isOutOfStock = p.stock <= 0;
                  
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleTileClick(p)}
                      disabled={p.type === 'raw'}
                      className={`flex flex-col items-stretch text-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-md active:scale-97 transition-all duration-200 min-h-[145px] relative group overflow-hidden ${
                        p.type === 'raw' ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {/* Cart badge quantity */}
                      {inCartQty > 0 && (
                        <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-brand text-white rounded-lg flex items-center justify-center font-bold text-3xs shadow-md animate-pulse">
                          {inCartQty}
                        </span>
                      )}

                      <span className="font-bold text-sm text-slate-800 dark:text-white truncate block group-hover:text-brand transition-colors" title={p.name}>
                        {p.name}
                      </span>
                      <span className="text-3xs text-slate-400 italic block mt-0.5 truncate uppercase font-semibold">
                        {p.category}
                      </span>

                      <div className="mt-auto pt-4 flex flex-col gap-1.5 justify-end">
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-extrabold text-base text-brand dark:text-emerald-400 font-mono">
                            {(p.type === 'raw' ? p.purchasePrice : p.salePrice).toLocaleString()}
                          </span>
                          <span className="text-3xs text-slate-400">
                            FCFA / {p.type === 'raw' ? p.purchaseUnit : p.saleUnit}
                          </span>
                        </div>

                        <div className={`text-xs flex items-center justify-center gap-1 ${
                          isOutOfStock ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {isOutOfStock ? (
                            <span className="text-red-500 font-bold">Rupture</span>
                          ) : (
                            <span className={getStockColorClass(p.stock)}>{p.stock} en stock</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};
