let PRODUCT_VARIANTS = [];

let PICKUP_STORES = [];

const PICKUP_TODAY_BTN = document.getElementById('pickup-today-btn');

const STORE_LIST = document.getElementById('store-list');

const STORE_LIST_PAGINATION = document.getElementById('pagination');

async function fetchProductVariantById(shopifyVariantId) {
  console.log("Fetching variant by ID: ", shopifyVariantId);
  if (!PRODUCT_VARIANTS) {
    console.log("Product Variants not initialized!");
    return null;
  }
  console.log("Available Product Variants: ", PRODUCT_VARIANTS);
  const variant = PRODUCT_VARIANTS.find(variant => variant.id == shopifyVariantId);
  return variant;
}

async function isVariantAvailable(shopifyVariantId) {
  const variant = await fetchProductVariantById(shopifyVariantId);
  console.log("*****************************This is the variant availability: ", variant?.available);
  return variant?.available;
}

async function getAllPickupStores(point, distance, includeWarehouse) {
  return await getStores(500, undefined, point, distance, includeWarehouse);
}

// TODO: Implement Searching Stores by partial zipcode.
async function getStores(viewSize, viewIndex, point, distance, includeWarehouse, filters = []) {
  let stores = [];
  let storesFound;
  let requestBody = {};
  try {
  if (point) {
    // const position = await getCurrentLocation();
    // point = `${position.coords.latitude},${position.coords.longitude}`;
    requestBody.point = point;

    if (distance) {
      requestBody.distance = distance;
    }
  }
  if (viewSize) {
    requestBody.viewSize = viewSize;
    if (viewIndex) {
      requestBody.viewIndex = viewIndex;
    }
  }
  filters.push("pickup_pref: true");

  requestBody.filters = filters;
  if (includeWarehouse === 'true') {
    requestBody.filters.push("storeType: (RETAIL_STORE OR WAREHOUSE OR OUTLET_WAREHOUSE)");
  } else {
    requestBody.filters.push("storeType: RETAIL_STORE");
  }
  requestBody.sortBy = "storeName asc";

  } catch (error) {
    console.error("Error getting location:", error.message);
    return stores; // return empty if location fails
  }

  try {
    const response = await fetch('https://dev-maarg.hotwax.io/rest/s1/api/stores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    stores = data?.response?.docs || [];
    storesFound = data?.response?.numFound || 0;
  } catch (error) {
    console.error('Error fetching stores:', error);
  }

  return { stores, storesFound };
}

function formatTime24to12(time) {
  if (!time) return '';
  let [hour, minute] = time.split(':');
  hour = parseInt(hour, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = ((hour + 11) % 12) + 1;
  return `${hour}:${minute} ${suffix}`;
}

function getStoreTimings(store) {
  const days = [
    'sunday', 'monday', 'tuesday',
    'wednesday', 'thursday', 'friday', 'saturday'
  ];
  const today = new Date().getDay();
  const dayName = days[today];

  const open = store[`${dayName}_open`];
  const close = store[`${dayName}_close`];

  if (!open || !close) {
    return;
  }

  return `${formatTime24to12(open)} - ${formatTime24to12(close)}`;
}


function getCurrentLocation() {
  console.log('Getting current location...');
  return new Promise((resolve, reject) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    } else {
      reject(new Error("Geolocation not supported"));
    }
  });
}


function getZipCode() {
  // Implement logic to get zip code
}

async function getLatLon(zipcode) {
  // Implement logic to get latitude and longitude
  if (!zipcode) {
    return;
  }
  let lat, lon;
  try {
    const response = await fetch(`https://dev-maarg.hotwax.io/rest/s1/api/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: {
          params: {
            q: '*:*',
            fq: `postcode:\"${zipcode}\"`,
            d: "50"
          }
        }
      })
    });
    const data = await response.json();
    lat = data?.response?.docs[0]?.latitude;
    lon = data?.response?.docs[0]?.longitude;
  } catch (error) {
    console.error("Error fetching latitude and longitude:", error);
  }
  return { lat, lon };
}

async function searchStoresByLocation(lat, lon) {
  console.log(`Searching stores by location - Latitude: ${lat}, Longitude: ${lon}`);
  resetStoreList();
  if (!lat || !lon) {
    return;
  }
  const storeListContainer = STORE_LIST;
  if (!storeListContainer) return;
  storeListContainer.dataset.point = `${lat},${lon}`;
  storeListContainer.dataset.viewIndex = 0;
  await generateStoreListHTML(storeListContainer);
  await initializePagination(storeListContainer);
}

async function searchStoresByZip(zipcode) {
  const { lat, lon } = await getLatLon(zipcode);
  await searchStoresByLocation(lat, lon);
}

function addToCart(currentVariantId, quantity = 1, properties) {
  if (!currentVariantId) {
    alert('No variant selected!');
    return;
  }
  fetch('/cart/add.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      items: [
        {
          id: currentVariantId,
          quantity: quantity,
          properties: properties
        }
      ]
    })
  })
  .then(response => response.json())
  .then(data => {
    // TODO: Update cart UI
    console.log('Added to cart:', data);
    return fetch('/cart.js');
  })
  .then(cart => {
    window.location.href = '/cart';
  })
  .catch(error => {
    console.log("Error adding to cart:", error);
  });
}

async function checkPickupInventory(payload) {
  const response = await fetch('https://dev-maarg.hotwax.io/rest/s1/ofbiz-oms-usl/checkBopisInventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return data;
}

async function filterStoresByInventoryAvailability(stores, selectedVariantId) {
  let checkBopisInventoryResult = [];
  let storeCodes = [];
  let storesWithInventory = [];
  stores.forEach(
    store => {
      storeCodes.push(store.storeCode);
    }
  );
  const payload = {};

  payload.facilityIds = storeCodes;
  payload.internalNames = [selectedVariantId];
  payload.productStoreId = 'STORE';
  payload.inventoryGroupId = 'SHOPIFY_1';

  const response = await checkPickupInventory(payload);

  if (response && response.resultList) {
    checkBopisInventoryResult = response.resultList;
    checkBopisInventoryResult.forEach(inv => {
      if (inv.computedAtp > 0) {
        storesWithInventory.push(inv.facilityId);
      }
    });
  }
  return storesWithInventory;
}

async function generateStoreListHTML(container) {
  if (!container) return;
  const enablePickup = Boolean(container.dataset.showPickupHere);

  // Clear any previous store listings
  container.innerHTML = '';

  console.log("This is the point: ", container.dataset.point);
  const pickupItemProperty = Boolean(container.dataset.pickupItemProperty);
  const pickupItemPropertyLabel = container.dataset.pickupItemPropertyLabel;
  const showOutOfStockStores = container.dataset.showOutOfStockStores === 'true';


  const viewIndex = container.dataset.viewIndex;
  const maxStoresToShow = parseInt(container.dataset.maxStoresDisplay, 10) || 5;
  const response = await getStores(maxStoresToShow, viewIndex, container.dataset.point, container.dataset.storeProximity, container.dataset.includeWarehouse);
  const stores = response.stores;
  const storesFound = response.storesFound;
  container.dataset.totalPages = Math.ceil(storesFound / maxStoresToShow);
  console.log("This is number of total pages: ", container.dataset.totalPages);

  if (storesFound === 0) {
    container.innerHTML = '<p style="text-align: center;">No stores found</p>';
      STORE_LIST_PAGINATION.style.display = 'none';
    return;
  }

  STORE_LIST_PAGINATION.style.display = 'flex';

  const storesWithInventory = await filterStoresByInventoryAvailability(stores, container.dataset.productSku);
  console.log("Stores fetched: ", stores.length, " and has inventory: ", storesWithInventory);

  const storeActions = enablePickup
  ? `<div class="store-actions">
       <button id="pickup-btn" class="btn">
         Pickup Here
       </button>
     </div>`
  : '';

  stores.forEach(store => {
    const inStock = storesWithInventory?.includes(store.storeCode);
    const storeName = store.storeName || '';
    const address1 = store.address1 || '';
    const city = store.city || '';
    const postalCode = store.postalCode || '';
    const countryCode = store.countryCode || '';
    const phone = store.storePhone || 'Phone Number Not Available';
    const timings = getStoreTimings(store);

    let properties = {
      "_pickupstore": store.storeCode
    };

    const html = `
      <div class="store">
        <div class="store-details">
          ${storeName ? `<h3 class="store-name">${storeName}</h3>` : ''}
          ${address1 ? `<p>${address1}</p>` : ''}
          ${(city || postalCode || countryCode) ? `<p>${[city, postalCode, countryCode].filter(Boolean).join(', ')}</p>` : ''}
        </div>
        <div class="store-inv-contacts">
          <p>${inStock ? 'In Stock' : 'Out of Stock'}</p>
          ${phone ? `<p>Phone: ${phone}</p>` : ''}
          ${timings ? `<p>Open Today: ${timings}</p>` : 'Store Timings Not Available!'}
        </div>
      </div>
      ${inStock ? storeActions : ''}
      <hr class="custom-line">
    `;

    container.insertAdjacentHTML('beforeend', html);

    if (enablePickup && inStock) {
      container.querySelector("#pickup-btn").addEventListener("click", addToCartListener = () => {
        if (pickupItemProperty) {
          (city || address1 || storeName) ? properties[pickupItemPropertyLabel] = [storeName, address1, city].filter(Boolean).join(', ') : '';
        }
        addToCart(Number(container.dataset.productId), 1, properties);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', async function () {
  let container = PICKUP_TODAY_BTN || STORE_LIST;

  if (container) {
    let isProdVariantAvailable = false;
    PRODUCT_VARIANTS = JSON.parse(container.dataset.hcVariants);
    if (PRODUCT_VARIANTS) {
      isProdVariantAvailable = await isVariantAvailable(container.dataset.productId);
    }
    if (isProdVariantAvailable) {
      container.style.display = 'block';
      STORE_LIST_PAGINATION.style.display = 'flex';
      if (container.dataset.storeSelectorDisplay === 'inline') {
        container.dataset.viewIndex = 0;
        await generateStoreListHTML(container);
        await initializePagination(container);
      }
    } else {
      container.style.display = 'none';
      STORE_LIST_PAGINATION.style.display = 'none';
    }
  }
});

document.addEventListener('change', async function(event) {
  // TODO: Find a way to get the selected variant's SKU, either save it on the very start.
  const selectedVariantId = event?.target?.defaultValue; // This is only the variant ID
  const container = PICKUP_TODAY_BTN || STORE_LIST;

  if (container && selectedVariantId) {
    const selectedVariant = await fetchProductVariantById(selectedVariantId);

    if (PICKUP_TODAY_BTN) {
      PICKUP_TODAY_BTN.dataset.productId = selectedVariant?.id;
      PICKUP_TODAY_BTN.dataset.productSku = selectedVariant?.sku;
      PICKUP_TODAY_BTN.dataset.productTitle = selectedVariant?.title;
    }
    
    STORE_LIST.dataset.productId = selectedVariant?.id;
    STORE_LIST.dataset.productSku = selectedVariant?.sku;
    STORE_LIST.dataset.productTitle = selectedVariant?.title;

    const isProdVariantAvailable = await isVariantAvailable(selectedVariant?.id);

    if (isProdVariantAvailable) {
      container.style.display = 'block';
      if (container.dataset.storeSelectorDisplay === 'inline') {
        resetStoreList();
        await generateStoreListHTML(container);
        await initializePagination(container);
      }
      STORE_LIST_PAGINATION.style.display = 'flex';
    } else {
      resetStoreList();
      container.style.display = 'none';
      STORE_LIST_PAGINATION.style.display = 'none';
    }
  }
});

async function showPickupModal(enablePickup, maxStoresToShow, storeProximity, pickupItemProperty, pickupItemPropertyLabel, showOutOfStockStores, includeWarehouse) {
  const modal = document.getElementById('pickup-modal-embed');
  if (!modal) return;

  modal.style.display = 'block';

  const container = STORE_LIST;
  if (!container) return;

  // TODO: These need to set while rendering the app-embed block instead
  container.dataset.showPickupHere = enablePickup;
  container.dataset.maxStoresDisplay = maxStoresToShow;
  container.dataset.viewIndex = 0;
  container.dataset.storeSelectorDisplay = 'modal';
  container.dataset.storeProximity = storeProximity;
  container.dataset.pickupItemProperty = pickupItemProperty;
  container.dataset.pickupItemPropertyLabel = pickupItemPropertyLabel;
  container.dataset.showOutOfStockStores = showOutOfStockStores;
  container.dataset.includeWarehouse = includeWarehouse;

  await generateStoreListHTML(container);
  await initializePagination(container);
}

function makePrevHandler(container) {
  return async function(event) {
    let currentPage = parseInt(container.dataset.viewIndex, 10);
    if (currentPage > 0) {
      currentPage--;
      document.getElementById('page-info').textContent = `${currentPage + 1}`;
      container.dataset.viewIndex = currentPage;
      await generateStoreListHTML(container);
      document.getElementById('next-page').disabled = false;
      document.getElementById('prev-page').disabled = currentPage === 0;
    }
  };
}

function makeNextHandler(container) {
  return async function(event) {
    let currentPage = parseInt(container.dataset.viewIndex, 10);
    let totalPages = parseInt(container.dataset.totalPages, 10);
    currentPage++;
    console.log("Total Pages: ", totalPages, " and current page: ", currentPage);
    if (currentPage === totalPages) {
      document.getElementById('next-page').disabled = true;
    }
    if (currentPage < totalPages) {
      document.getElementById('page-info').textContent = `${currentPage + 1}`;
      container.dataset.viewIndex = currentPage;
      await generateStoreListHTML(container);
      document.getElementById('prev-page').disabled = false;
      document.getElementById('next-page').disabled = currentPage >= totalPages - 1;
    }
  };
}

async function initializePagination(container) {
  if (!container) return;
  container._prevHandler = makePrevHandler(container);
  container._nextHandler = makeNextHandler(container);

  document.getElementById('prev-page').addEventListener('click', container._prevHandler);
  document.getElementById('next-page').addEventListener('click', container._nextHandler);
}

function closePickupModal() {
  const modal = document.getElementById("pickup-modal-embed");
  if (modal) {
    modal.style.display = "none";
    const searchBarInput = document.querySelector(
      ".hc-pickup-modal__search input"
    );
    if (searchBarInput) {
      searchBarInput.value = "";
    }
    resetStoreList();
  }
}


function resetStoreList() {
  const container = STORE_LIST;
  if (!container) return;

  container.dataset.viewIndex = 0;
  container.dataset.point = '';
  container.innerHTML = '';

  const pageInfo = document.getElementById('page-info');
  if (pageInfo) pageInfo.textContent = "1";

  // Reset pagination buttons
  document.getElementById('prev-page').disabled = true;
  document.getElementById('next-page').disabled = false;

  // Remove handlers using stored references
  document.getElementById('prev-page')?.removeEventListener('click', container._prevHandler);
  document.getElementById('next-page')?.removeEventListener('click', container._nextHandler);
}

class MyStore extends HTMLElement {
  constructor() {
    super();
    console.log("MyStore element created (constructor)");
  }

  connectedCallback() {
    const labelDiv = this.querySelector('#my-store-label');
    if (labelDiv) {
      labelDiv.textContent = labelDiv.textContent + ' : ';
    }

    const storeId = this.dataset.storeId;
    const customerId = this.dataset.customerId;

    console.log("MyStore connected:", { storeId, customerId });

    this.setMyStore();
  }

  disconnectedCallback() {
    console.log("MyStore element removed from the DOM");
  }

  async getCustomerDefaultStore() {
    try {
      const response = await fetch(
        `https://dev-oms.hotwax.io/api/getShopifyCustomerDefaultStore?customerId=${this.dataset.customerId}&shopifyShopId=${this.dataset.storeId}`
      );

      const resp = await response.json();
      console.log("API response:", resp);

      if (!resp?.customer?.facilityId) return;

      const storeResponse = await getStores(
        undefined, undefined, undefined, undefined, undefined,
        [`storeCode: ${resp.customer.facilityId}`]
      );

      const store = storeResponse?.stores?.[0];
      console.log("Default store:", store);
      return store;

    } catch (err) {
      console.error("Error fetching customer default store:", err);
      return null;
    }
  }

  async setMyStore() {
    const store = await this.getCustomerDefaultStore();
    const myStoreDetailsWrapper = this.querySelector('#my-store-details');

    if (!myStoreDetailsWrapper) {
      console.warn("No #my-store-details wrapper found");
      return;
    }

    if (!store) {
      console.log("Store not found");
      const storeSelectText = document.createElement('span');
      storeSelectText.id = 'store-select';
      storeSelectText.textContent = 'Select a Store';
      storeSelectText.style.cursor = 'pointer';
      myStoreDetailsWrapper.appendChild(storeSelectText);

      storeSelectText.addEventListener('click', () => this.openMyStoreModal());
      return;
    }

    this.dataset.storeCode = store.storeCode;
    this.dataset.storeName = store.storeName;

    console.log("Store code:", store.storeCode);
    console.log("Store name:", store.storeName);

    const storeNameDiv = document.createElement('span');
    storeNameDiv.textContent = store.storeName;
    myStoreDetailsWrapper.appendChild(storeNameDiv);

    const timings = getStoreTimings(store);
    console.log("Store timings:", timings);

    if (timings) {
      const storeTimingsDiv = document.createElement('span');
      storeTimingsDiv.textContent = timings;
      myStoreDetailsWrapper.appendChild(storeTimingsDiv);
    }
  }

  openMyStoreModal() {
    const modal = document.querySelector('my-store-modal');
    if (modal) {
      console.log("Here I am");
      modal.style.display = 'block';
    } else {
      console.error("<my-store-modal> not found in DOM");
    }
  }
}

class MyStoreModal extends HTMLElement {
  constructor() {
    super();
    this.style.display = 'none';
  }

  async connectedCallback() {
    try {
      const response = await getAllPickupStores();
      console.log("Pickup stores:", response, " and ", response?.stores?.length);
    } catch (err) {
      console.error("Error fetching pickup stores:", err);
    }
  }

  disconnectedCallback() {
    console.log("MyStoreModal element removed from the DOM");
  }

  async setShopifyCustomerDefaultStore() {

  }
}

if (!customElements.get("my-store")) {
  customElements.define("my-store", MyStore);
}

if (!customElements.get("my-store-modal")) {
  customElements.define("my-store-modal", MyStoreModal);
}

