import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { BusinessMembershipRole, BusinessProfile } from '../../types/business';
import type {
  MarketplaceProduct,
  ProductCondition,
  ProductStatus,
} from '../../types/marketplace';
import {
  deleteMarketplaceProductRecord,
  saveMarketplaceProductRecord,
  subscribeStoreMarketplaceProducts,
} from '../../services/commerce';
import { formatCurrencyCents } from '../../services/marketplaceCatalogAssets';
import {
  launchCommerceDashboardSso,
  provisionCommerceStoreForBusiness,
} from '../../services/businessProfiles';
import { uploadMediaToCloudflareR2 } from '../../services/storage';

interface BusinessCatalogViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  viewerUid: string;
  onOpenProduct: (productId: string) => void;
  onStoreProvisioned?: (storeId: string, storeSlug: string) => void;
}

const CONDITIONS: ProductCondition[] = [
  'New',
  'Used - Like New',
  'Used - Good',
  'Used - Fair',
];

export function BusinessCatalogView({
  businessProfile,
  role,
  viewerUid,
  onOpenProduct,
  onStoreProvisioned,
}: BusinessCatalogViewProps) {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'ALL'>('ALL');
  const [provisioning, setProvisioning] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(businessProfile.category || 'General');
  const [priceInput, setPriceInput] = useState('');
  const [stockInput, setStockInput] = useState('10');
  const [condition, setCondition] = useState<ProductCondition>('New');
  const [status, setStatus] = useState<ProductStatus>('ACTIVE');
  const [imageUrl, setImageUrl] = useState('');
  const [location, setLocation] = useState(businessProfile.location || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdminOrOwner = role === 'OWNER' || role === 'ADMIN';
  const canEditCatalog =
    role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

  useEffect(() => {
    if (!businessProfile.commerceStoreId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeStoreMarketplaceProducts(
      businessProfile.commerceStoreId,
      businessProfile.ownerUid,
      viewerUid,
      (items) => {
        setProducts(items);
        setLoading(false);
      },
      () => {
        setProducts([]);
        setLoading(false);
      }
    );
  }, [businessProfile.commerceStoreId, businessProfile.ownerUid, viewerUid]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, statusFilter]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setCategory(businessProfile.category || 'General');
    setPriceInput('');
    setStockInput('10');
    setCondition('New');
    setStatus('ACTIVE');
    setImageUrl('');
    setLocation(businessProfile.location || '');
    setError(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditForm = (product: MarketplaceProduct) => {
    setEditingId(product.id);
    setTitle(product.title);
    setDescription(product.description);
    setCategory(product.category || businessProfile.category || 'General');
    setPriceInput((product.priceCents / 100).toFixed(2));
    setStockInput(String(product.stock));
    setCondition(product.condition || 'New');
    setStatus(product.status);
    setImageUrl(product.imageUrl || '');
    setLocation(product.location || businessProfile.location || '');
    setError(null);
    setFormOpen(true);
  };

  const handleActivateStorefront = async () => {
    if (provisioning || !isAdminOrOwner) return;
    setError(null);
    setNotice(null);
    setProvisioning(true);
    try {
      const res = await provisionCommerceStoreForBusiness(businessProfile.id);
      setNotice('Storefront activated. You can now publish catalog products.');
      onStoreProvisioned?.(res.storeId, res.storeSlug);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to activate Business Storefront.'
      );
    } finally {
      setProvisioning(false);
    }
  };

  const handleOpenPortal = async () => {
    if (portalBusy || !isAdminOrOwner) return;
    setPortalBusy(true);
    setError(null);
    try {
      await launchCommerceDashboardSso(businessProfile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open Seller Portal.');
      setPortalBusy(false);
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const res = await uploadMediaToCloudflareR2(file, 'posts');
      setImageUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload product photo.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessProfile.commerceStoreId || saving || !canEditCatalog) return;
    setError(null);
    setNotice(null);

    const parsedPrice = Number(priceInput);
    if (!title.trim() || title.trim().length < 2) {
      setError('Product title must be at least 2 characters.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('Enter a valid price greater than 0.');
      return;
    }
    const parsedStock = Math.max(0, Math.round(Number(stockInput) || 0));

    setSaving(true);
    try {
      await saveMarketplaceProductRecord({
        id: editingId || undefined,
        storeId: businessProfile.commerceStoreId,
        storeName: businessProfile.displayName,
        storeSlug: businessProfile.commerceStoreSlug || businessProfile.slug,
        ownerUid: businessProfile.ownerUid,
        businessProfileId: businessProfile.id,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'General',
        priceCents: Math.round(parsedPrice * 100),
        currency: businessProfile.currency || 'USD',
        imageUrl: imageUrl.trim(),
        condition,
        location: location.trim(),
        stock: parsedStock,
        status,
        featured: false,
        isCreate: !editingId,
      });
      setFormOpen(false);
      resetForm();
      setNotice(editingId ? 'Product updated.' : 'Product added to storefront.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setError(null);
    setNotice(null);
    try {
      await deleteMarketplaceProductRecord(productId);
      setConfirmDeleteId(null);
      setNotice('Product removed from catalog.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete product.');
    }
  };

  if (!businessProfile.commerceStoreId) {
    return (
      <section aria-label="Business Catalog Setup" className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Activate Your Business Storefront
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Connect a dedicated storefront to {businessProfile.displayName} to list products, share catalog cards in customer chats, and manage orders.
            </p>
          </div>
          {isAdminOrOwner ? (
            <button
              type="button"
              disabled={provisioning}
              onClick={() => void handleActivateStorefront()}
              className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Store className="w-4 h-4" aria-hidden="true" />
              <span>{provisioning ? 'Activating Storefront...' : 'Activate Storefront'}</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ask the Business Owner or an Admin to activate the storefront first.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Business Product Catalog" className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Product Catalog ({products.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Storefront: {businessProfile.commerceStoreSlug || businessProfile.slug} · Currency: {businessProfile.currency}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdminOrOwner && (
            <button
              type="button"
              disabled={portalBusy}
              onClick={() => void handleOpenPortal()}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{portalBusy ? 'Authorizing...' : 'Seller Portal'}</span>
            </button>
          )}
          {canEditCatalog && (
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {formOpen && canEditCatalog && (
        <form
          onSubmit={handleSaveProduct}
          className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {editingId ? 'Edit Product' : 'Create Product'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              aria-label="Close product form"
              className="min-h-[36px] min-w-[36px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="cat-prod-title" className="block text-xs font-semibold mb-1">
                Product Title
              </label>
              <input
                id="cat-prod-title"
                type="text"
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Minimal Ceramic Pour-Over Set"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>

            <div>
              <label htmlFor="cat-prod-price" className="block text-xs font-semibold mb-1">
                Price ({businessProfile.currency || 'USD'})
              </label>
              <input
                id="cat-prod-price"
                type="number"
                step="0.01"
                min="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="49.00"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="cat-prod-stock" className="block text-xs font-semibold mb-1">
                Stock Quantity
              </label>
              <input
                id="cat-prod-stock"
                type="number"
                min="0"
                step="1"
                value={stockInput}
                onChange={(e) => setStockInput(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="cat-prod-cat" className="block text-xs font-semibold mb-1">
                Category
              </label>
              <input
                id="cat-prod-cat"
                type="text"
                maxLength={40}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>

            <div>
              <label htmlFor="cat-prod-status" className="block text-xs font-semibold mb-1">
                Visibility Status
              </label>
              <select
                id="cat-prod-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                <option value="ACTIVE">Active (Listed in Marketplace)</option>
                <option value="DRAFT">Draft (Hidden from Marketplace)</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div>
              <label htmlFor="cat-prod-condition" className="block text-xs font-semibold mb-1">
                Condition
              </label>
              <select
                id="cat-prod-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as ProductCondition)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cat-prod-loc" className="block text-xs font-semibold mb-1">
                Location (Optional)
              </label>
              <input
                id="cat-prod-loc"
                type="text"
                maxLength={80}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="cat-prod-img" className="block text-xs font-semibold mb-1">
                Product Photo URL or Upload
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="cat-prod-img"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 min-w-[200px] min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <label className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{uploadingImage ? 'Uploading...' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="cat-prod-desc" className="block text-xs font-semibold mb-1">
                Description
              </label>
              <textarea
                id="cat-prod-desc"
                rows={3}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Materials, dimensions, shipping lead time..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="min-h-[40px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Publish Product'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search catalog products..."
            aria-label="Search catalog products"
            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-60 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold">No matching catalog products</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {canEditCatalog
              ? 'Add products above so customers can discover and inquire about them.'
              : 'No products are currently visible under this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => onOpenProduct(product.id)}
                className="text-left block w-full cursor-pointer group"
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-full h-44 object-cover block group-hover:scale-[1.02] transition-transform"
                  />
                ) : (
                  <div className="w-full h-44 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <ShoppingBag className="w-8 h-8 text-slate-400" aria-hidden="true" />
                  </div>
                )}
              </button>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProduct(product.id)}
                      className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1 cursor-pointer"
                    >
                      {product.title}
                    </button>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                      {product.status}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                    {formatCurrencyCents(product.priceCents, product.currency)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    Stock: {product.stock} · {product.category}
                  </p>
                </div>

                {canEditCatalog && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(product)}
                      className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    {confirmDeleteId === product.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteProduct(product.id)}
                          className="min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(product.id)}
                        aria-label={`Delete ${product.title}`}
                        className="min-h-[34px] px-3 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
