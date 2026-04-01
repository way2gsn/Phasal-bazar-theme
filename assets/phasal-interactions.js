class PhasalInteractions {
  constructor() {
    this.cart = null;
    this.wishlistKey = 'phasalWishlist';
    this.pendingVariantIds = new Set();
    this.toastTimeout = null;
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    document.addEventListener('click', this.handleClick);
    this.syncWishlistUI();
    this.resetProductCards();
    this.syncCartUI();
  }

  async syncCartUI() {
    try {
      const response = await fetch(`${routes.cart_url}.js`, { cache: 'no-store' });
      this.cart = await response.json();
      this.updateCartCount();
      this.updateProductCardQuantities();
    } catch (error) {
      console.error('Unable to sync cart UI', error);
    }
  }

  getWishlist() {
    try {
      return JSON.parse(localStorage.getItem(this.wishlistKey) || '[]');
    } catch (error) {
      return [];
    }
  }

  setWishlist(items) {
    localStorage.setItem(this.wishlistKey, JSON.stringify(items));
  }

  updateCartCount() {
    const count = this.cart?.item_count || 0;
    document.querySelectorAll('[data-phasal-cart-count]').forEach((node) => {
      node.textContent = count;
    });
  }

  getVariantQuantity(variantId) {
    if (!this.cart?.items) return 0;
    const line = this.cart.items.find((item) => item.variant_id === variantId);
    return line ? line.quantity : 0;
  }

  updateProductCardQuantities() {
    document.querySelectorAll('[data-phasal-product-card]').forEach((card) => {
      const variantId = Number(card.dataset.variantId);
      const quantity = this.getVariantQuantity(variantId);
      this.setCardQuantity(card, quantity);
    });
  }

  resetProductCards() {
    document.querySelectorAll('[data-phasal-product-card]').forEach((card) => {
      this.setCardQuantity(card, 0);
    });
  }

  setCardQuantity(card, quantity) {
    const addButton = card.querySelector('[data-phasal-add]');
    const quantityWrap = card.querySelector('[data-phasal-quantity]');
    const quantityValue = card.querySelector('[data-phasal-quantity-value]');

    if (quantityValue) quantityValue.textContent = quantity;

    card.classList.toggle('is-in-cart', quantity > 0);

    if (addButton) addButton.hidden = quantity > 0;
    if (quantityWrap) quantityWrap.hidden = quantity < 1;
  }

  syncWishlistUI() {
    const wishlist = this.getWishlist();
    const ids = new Set(wishlist.map((item) => Number(item.id)));

    document.querySelectorAll('[data-phasal-wishlist-count]').forEach((node) => {
      node.textContent = wishlist.length;
      node.hidden = wishlist.length === 0;
    });

    document.querySelectorAll('[data-phasal-wishlist-toggle]').forEach((button) => {
      const productId = Number(button.dataset.productId);
      const active = ids.has(productId);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    this.renderWishlistPanel(wishlist);
  }

  renderWishlistPanel(wishlist) {
    const list = document.querySelector('[data-phasal-wishlist-list]');
    const empty = document.querySelector('[data-phasal-wishlist-empty]');
    if (!list || !empty) return;

    if (wishlist.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = wishlist
      .map(
        (item) => `
          <div class="phasal-wishlist__item">
            <a class="phasal-wishlist__link" href="${item.url}">
              <div class="phasal-wishlist__thumb">${item.image ? `<img src="${item.image}" alt="${item.title}">` : ''}</div>
              <div>
                <div class="phasal-wishlist__title">${item.title}</div>
                <div class="phasal-wishlist__price">${item.price || ''}</div>
              </div>
            </a>
            <button
              class="phasal-wishlist__remove"
              type="button"
              data-phasal-wishlist-remove
              data-product-id="${item.id}"
              aria-label="Remove ${item.title} from wishlist"
            >×</button>
          </div>
        `
      )
      .join('');
  }

  async addToCart(variantId, quantity) {
    const body = {
      items: [{ id: variantId, quantity }],
      sections: this.getSectionIds(),
      sections_url: window.location.pathname,
    };

    const response = await fetch(`${routes.cart_add_url}.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Unable to add item to cart');
    }

    const data = await response.json();
    this.renderDrawerSections(data, true);
    // Explicitly sync the count and quantities for non-AJAX elements
    this.syncCartUI();
  }

  async changeCartQuantity(variantId, quantity) {
    if (!this.cart?.items) {
      await this.syncCartUI();
    }

    const lineIndex = this.cart.items.findIndex((item) => item.variant_id === variantId);
    if (lineIndex === -1) {
      if (quantity > 0) {
        await this.addToCart(variantId, quantity);
      }
      return;
    }

    const response = await fetch(routes.cart_change_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        line: lineIndex + 1,
        quantity,
        sections: this.getSectionIds(),
        sections_url: window.location.pathname,
      }),
    });

    if (!response.ok) {
      throw new Error('Unable to update cart quantity');
    }

    const data = await response.json();
    this.renderDrawerSections(data, false);
    this.cart = data;
    this.updateCartCount();
    this.updateProductCardQuantities();
  }

  getSectionIds() {
    const ids = [];
    if (document.getElementById('CartDrawer')) ids.push('cart-drawer');
    if (document.getElementById('cart-icon-bubble')) ids.push('cart-icon-bubble');
    return ids;
  }

  renderDrawerSections(data, shouldOpen) {
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer && data.sections && (shouldOpen || cartDrawer.classList.contains('active'))) {
      cartDrawer.renderContents(data);
    }
  }

  showCartToast(message) {
    if (!message) return;

    let stack = document.querySelector('[data-phasal-cart-toast-stack]');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'phasal-cart-toast-stack';
      stack.setAttribute('data-phasal-cart-toast-stack', '');
      document.body.appendChild(stack);
    }

    stack.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'phasal-cart-toast';
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 220);
    }, 2200);
  }

  applyOptimisticQuantity(variantId, nextQuantity) {
    if (!this.cart) {
      this.cart = { item_count: 0, items: [] };
    }

    if (!this.cart.items) this.cart.items = [];

    const existingIndex = this.cart.items.findIndex((item) => item.variant_id === variantId);
    const previousQuantity = existingIndex >= 0 ? this.cart.items[existingIndex].quantity : 0;
    const delta = nextQuantity - previousQuantity;

    this.cart.item_count = Math.max((this.cart.item_count || 0) + delta, 0);

    if (existingIndex >= 0) {
      if (nextQuantity <= 0) {
        this.cart.items.splice(existingIndex, 1);
      } else {
        this.cart.items[existingIndex].quantity = nextQuantity;
      }
    } else if (nextQuantity > 0) {
      this.cart.items.push({ variant_id: variantId, quantity: nextQuantity });
    }

    this.updateCartCount();
    this.updateProductCardQuantities();

    return previousQuantity;
  }

  async handleCartButton(button, nextQuantity) {
    const card = button.closest('[data-phasal-product-card]');
    const variantId = Number(card?.dataset.variantId);
    const productTitle = card?.dataset.productTitle;
    if (!variantId || this.pendingVariantIds.has(variantId)) return;

    if (!this.cart) {
      await this.syncCartUI();
    }

    this.pendingVariantIds.add(variantId);
    card?.classList.add('is-loading');

    const previousQuantity = this.applyOptimisticQuantity(variantId, nextQuantity);

    try {
      if (previousQuantity === 0 && nextQuantity > 0) {
        await this.addToCart(variantId, nextQuantity);
        this.showCartToast(`${productTitle || 'Product'} added to cart`);
      } else {
        await this.changeCartQuantity(variantId, nextQuantity);
      }
    } catch (error) {
      console.error(error);
      this.applyOptimisticQuantity(variantId, previousQuantity);
      await this.syncCartUI();
    } finally {
      this.pendingVariantIds.delete(variantId);
      card?.classList.remove('is-loading');
    }
  }

  toggleWishlist(button) {
    const productId = Number(button.dataset.productId);
    if (!productId) return;

    const wishlist = this.getWishlist();
    const index = wishlist.findIndex((item) => Number(item.id) === productId);

    if (index >= 0) {
      wishlist.splice(index, 1);
    } else {
      wishlist.push({
        id: productId,
        title: button.dataset.productTitle,
        url: button.dataset.productUrl,
        image: button.dataset.productImage,
        price: button.dataset.productPrice,
      });
      // Add animation to the heart button only on add
      button.classList.add('is-animating');
      setTimeout(() => button.classList.remove('is-animating'), 300);
    }

    this.setWishlist(wishlist);
    this.syncWishlistUI();
  }

  toggleWishlistPanel(forceOpen = null) {
    const panel = document.querySelector('[data-phasal-wishlist-panel]');
    if (!panel) return;
    const open = forceOpen === null ? !panel.classList.contains('is-open') : forceOpen;
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('overflow-hidden', open);
  }

  handleClick(event) {
    const addButton = event.target.closest('[data-phasal-add]');
    if (addButton) {
      event.preventDefault();
      this.handleCartButton(addButton, 1);
      return;
    }

    const plusButton = event.target.closest('[data-phasal-qty-plus]');
    if (plusButton) {
      event.preventDefault();
      const card = plusButton.closest('[data-phasal-product-card]');
      const nextQuantity = this.getVariantQuantity(Number(card.dataset.variantId)) + 1;
      this.handleCartButton(plusButton, nextQuantity);
      return;
    }

    const minusButton = event.target.closest('[data-phasal-qty-minus]');
    if (minusButton) {
      event.preventDefault();
      const card = minusButton.closest('[data-phasal-product-card]');
      const nextQuantity = Math.max(this.getVariantQuantity(Number(card.dataset.variantId)) - 1, 0);
      this.handleCartButton(minusButton, nextQuantity);
      return;
    }

    const wishlistToggle = event.target.closest('[data-phasal-wishlist-toggle]');
    if (wishlistToggle) {
      event.preventDefault();
      this.toggleWishlist(wishlistToggle);
      return;
    }

    const wishlistOpen = event.target.closest('[data-phasal-wishlist-open]');
    if (wishlistOpen) {
      event.preventDefault();
      this.toggleWishlistPanel(true);
      return;
    }

    const wishlistRemove = event.target.closest('[data-phasal-wishlist-remove]');
    if (wishlistRemove) {
      event.preventDefault();
      this.toggleWishlist(wishlistRemove);
      return;
    }

    if (event.target.matches('[data-phasal-wishlist-panel], [data-phasal-wishlist-close]')) {
      event.preventDefault();
      this.toggleWishlistPanel(false);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const interactions = new PhasalInteractions();
  interactions.init();
});
