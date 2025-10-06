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
  return variant?.available;
}

async function getStoresByBaseCondition(payload) {
  const { point, distance, includeWarehouse, filters } = payload;   
  return await getStores(500, undefined, point, distance, includeWarehouse, filters);
}

// TODO: Implement Searching Stores by partial zipcode.
async function getStores(viewSize, viewIndex, point, distance, includeWarehouse, filters = []) {
  let stores = [];
  let totalStores;
  let requestBody = {};
  try {
  if (point) {
    requestBody.point = point;

    if (distance) {
      requestBody.distance = distance;
    }
  }
  if (viewSize) {
    requestBody.viewSize = viewSize;
  }
  if (viewIndex) {
    requestBody.viewIndex = viewIndex;
  }
  filters.push("pickup_pref: true");

  requestBody.filters = filters;
  if (includeWarehouse === 'true') {
    requestBody.filters.push("storeType: (RETAIL_STORE OR WAREHOUSE)");
  } else {
    requestBody.filters.push("storeType: RETAIL_STORE");
  }

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
    totalStores = data?.response?.numFound || 0;
  } catch (error) {
    console.error('Error fetching stores:', error);
  }

  return { stores, totalStores: totalStores };
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
  if (!zipcode) {
    console.error("Empty Input");
    return;
  }
  const { lat, lon } = await getLatLon(zipcode);
  await searchStoresByLocation(lat, lon);
}

function addToCart(currentVariantId, properties, quantity = 1) {
  if (!currentVariantId) {
    alert('No variant selected!');
    return;
  }
  fetch('/cart/add.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

function createInlineMyStorePickupHead(store, payload) {
  const myStorePickupWrapper = document.createElement('div');
  myStorePickupWrapper.id = store.storeCode;
  myStorePickupWrapper.classList.add('hc-pc-ms-inline-div');

  const { enablePickup, isInStock, pickupItemProperty, properties, pickupItemPropertyLabel, productId } = payload;

  // Clear any previous My Store Details
  myStorePickupWrapper.innerHTML = "";

  const headingSpan = document.createElement('span');
  headingSpan.textContent = `Pick up at ${store.storeName}`;

  myStorePickupWrapper.appendChild(headingSpan);

  if (enablePickup && isInStock) {
    const myStorePickupBtn = document.createElement('button');
    myStorePickupBtn.textContent = 'PICK UP IN STORE';
    myStorePickupBtn.classList.add('pickup-btn');

    myStorePickupBtn.addEventListener('click', () => {
      if (pickupItemProperty) {
        (store.city || store.address1 || store.storeName) ? properties[pickupItemPropertyLabel] = [store.storeName, store.address1, store.city].filter(Boolean).join(', ') : '';
      }
      addToCart(Number(productId), properties);
    });

    myStorePickupWrapper.appendChild(myStorePickupBtn);
  }
  return myStorePickupWrapper;
}

function createPickupStoreDiv (store, payload) {

  console.log("This is store: ", store, " and payload: ", payload);
  if (!store) {
    console.log("Empty Value passes in store param");
    return;
  }

  const { enablePickup, isInStock, pickupItemProperty, properties, pickupItemPropertyLabel, productId, storeSelectorDisplay } = payload;

  const newStoreDiv = document.createElement('div');
  newStoreDiv.classList.add('store');

  const storeDetailDiv = document.createElement('div');
  storeDetailDiv.classList.add('store-details');

  const storeName = document.createElement('h3');
  storeName.textContent = store.storeName;
  storeName.classList.add('store-name');
  const storeAddress = document.createElement('span');
  storeAddress.textContent = store.address1;

  storeDetailDiv.appendChild(storeName);
  storeDetailDiv.appendChild(storeAddress);

  if (store.city || store.postalCode || store.countryCode) {
    const storeFullAddress = document.createElement('span');
    storeFullAddress.textContent = [store.city, store.postalCode, store.countryCode].filter(Boolean).join(', ');
    storeDetailDiv.appendChild(storeFullAddress);
  }

  const storeInvContacts = document.createElement('div');
  storeInvContacts.classList.add('store-inv-contacts');
  const stockDetail = document.createElement('span');
  const stockDetailText = document.createElement('span');
  const stockDetailIcon = document.createElement('img');
  stockDetailIcon.classList.add('hc-icon');
  stockDetailIcon.src = enablePickup && isInStock ? '../assets/CheckIcon.svg' : '../assets/XSmallIcon.svg';
  stockDetailText.textContent = enablePickup && isInStock ? 'In Stock' : 'Out of Stock';
  stockDetail.append(stockDetailIcon, stockDetailText);
  storeInvContacts.appendChild(stockDetail);

  if (store.storePhone) {
    const storePhone = document.createElement('span');
    const phoneIcon = document.createElement('img');
    phoneIcon.classList.add('hc-icon');
    phoneIcon.src = '../assets/PhoneIcon.svg';
    const storePhoneNum = document.createElement('span');
    storePhoneNum.textContent = store.storePhone;
    storePhone.appendChild(phoneIcon);
    storePhone.appendChild(storePhoneNum);
    storeInvContacts.appendChild(storePhone);
  }

  const storeTimings = getStoreTimings(store);

  if (storeTimings) {
    const timingSpan = document.createElement('span');
    const clockIcon = document.createElement('img');
    clockIcon.classList.add('hc-icon');
    clockIcon.src = '../assets/ClockIcon.svg';
    const storeTiming = document.createElement('span');
    storeTiming.textContent = storeTimings;

    timingSpan.appendChild(clockIcon);
    timingSpan.appendChild(storeTiming);
    storeInvContacts.appendChild(timingSpan);
  }

  newStoreDiv.append(storeDetailDiv, storeInvContacts);

  const pickupStoreWrapperDiv = document.createElement('div');
  pickupStoreWrapperDiv.id = store.storeCode;
  pickupStoreWrapperDiv.classList.add('pickup-store-wrapper');

  pickupStoreWrapperDiv.appendChild(newStoreDiv);

  if (enablePickup && isInStock) {
    const pickupButton = document.createElement('button');
    pickupButton.textContent = 'PICK UP IN STORE';
    pickupButton.classList.add('pickup-btn');
    if (storeSelectorDisplay === 'inline') {
      storeInvContacts.appendChild(pickupButton);
    } else {
      pickupStoreWrapperDiv.appendChild(pickupButton);
    }
    pickupButton.addEventListener('click', () => {
      if (pickupItemProperty) {
        (store.city || store.address1 || store.storeName) ? properties[pickupItemPropertyLabel] = [store.storeName, store.address1, store.city].filter(Boolean).join(', ') : '';
      }
      addToCart(Number(productId), properties);
    });
  }
  return pickupStoreWrapperDiv;
}

async function generateStoreListHTML(container) {
  if (!container) return;
  const enablePickup = container.dataset.showPickupHere === 'true';

  // Clear any previous store listings
  container.innerHTML = '';

  console.log("This is the point: ", container.dataset.point);
  const pickupItemProperty = container.dataset.pickupItemProperty === 'true';
  const pickupItemPropertyLabel = container.dataset.pickupItemPropertyLabel;
  const showOutOfStockStores = container.dataset.showOutOfStockStores === 'true';
  const showHomeStoreInSearch = container.dataset.showHomeStoreInSearch === 'true';


  const viewIndex = container.dataset.viewIndex;
  const maxStoresToShow = parseInt(container.dataset.maxStoresDisplay, 10) || 5;
  const response = await getStores(maxStoresToShow, viewIndex, container.dataset.point, container.dataset.storeProximity, container.dataset.includeWarehouse);
  const stores = response.stores;
  const totalStores = response.totalStores;
  container.dataset.totalPages = Math.ceil(totalStores / maxStoresToShow);
  console.log("This is number of total pages: ", container.dataset.totalPages);

  if (!totalStores) {
    container.innerHTML = '<p style="text-align: center;">No stores found</p>';
      STORE_LIST_PAGINATION.style.display = 'none';
    return;
  }

  STORE_LIST_PAGINATION.style.display = 'flex';

  const storesWithInventory = await filterStoresByInventoryAvailability(stores, container.dataset.productSku);
  console.log("Stores fetched: ", stores.length, " and has inventory: ", storesWithInventory);

  let myStore = localStorage.getItem("defaultStore");
  if (myStore) {
    myStore = JSON.parse(myStore);
  }

  stores.forEach(store => {

    if (!showHomeStoreInSearch && myStore && store.storeCode === myStore.storeCode) {
      return;
    }

    const properties = {
      "_pickupstore": store.storeCode
    };

    const payload = {
      pickupItemProperty: pickupItemProperty,
      pickupItemPropertyLabel: pickupItemPropertyLabel,
      enablePickup: enablePickup,
      isInStock: storesWithInventory?.includes(store.storeCode),
      properties: properties,
      productId: Number(container.dataset.productId),
      storeSelectorDisplay: container.dataset.storeSelectorDisplay
    }

    const newStoreDiv = createPickupStoreDiv(store, payload);

    container.appendChild(newStoreDiv);
    const customLine = document.createElement('hr');
    customLine.classList.add('custom-line');
    container.appendChild(customLine);
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
      if (container.dataset.storeSelectorDisplay === 'inline') {
        STORE_LIST_PAGINATION.style.display = 'none';
        let myStore = localStorage.getItem("defaultStore");
        const myStorePickupDivWrapper = document.getElementById('hc-pc-my-store');
        const checkOtherStoresBtn = document.createElement('u');
        checkOtherStoresBtn.dataset.showStores = 'false';
        checkOtherStoresBtn.style.cursor = 'pointer';
        if (myStore) {
          myStore = JSON.parse(myStore);
          const payload = {};
          payload.enablePickup = container.dataset.showPickupHere === 'true';
          payload.productId = container.dataset.productId;
          payload.properties = {
            "_pickupstore": myStore.storeCode
          };
          payload.pickupItemPropertyLabel = container.dataset.pickupItemPropertyLabel;
          payload.pickupItemProperty = container.dataset.pickupItemProperty;
          payload.storeSelectorDisplay = container.dataset.storeSelectorDisplay;

          const storesWithInventory = await filterStoresByInventoryAvailability([myStore], container.dataset.productSku);
          const isInStock = storesWithInventory && storesWithInventory.includes(myStore.storeCode);
          console.log("Does My Store has Inventory: ", isInStock);
          payload.isInStock = isInStock;

          const newMyStoreDiv = createInlineMyStorePickupHead(myStore, payload);
          myStorePickupDivWrapper.appendChild(newMyStoreDiv);
          myStorePickupDivWrapper.style.display = 'block';
          checkOtherStoresBtn.textContent = 'CHECK OTHER STORES';
        } else {
          checkOtherStoresBtn.textContent = 'SHOW PICKUP STORES';
        }

        checkOtherStoresBtn.addEventListener('click', async () => {
          if (checkOtherStoresBtn.dataset.showStores === 'false') {
            checkOtherStoresBtn.dataset.showStores = 'true';
            checkOtherStoresBtn.textContent = 'HIDE STORES';
            container.dataset.viewIndex = 0;
            container.style.display = 'block';
            STORE_LIST_PAGINATION.style.display = 'flex';
            await generateStoreListHTML(container);
            await initializePagination(container);
          } else {
            resetStoreList();
            container.style.display = 'none';
            STORE_LIST_PAGINATION.style.display = 'none';
            checkOtherStoresBtn.dataset.showStores = 'false';
            checkOtherStoresBtn.textContent = localStorage.getItem("defaultStore") ? 'CHECK OTHER STORES' : 'SHOW PICKUP STORES';
          }
        });

        myStorePickupDivWrapper.after(checkOtherStoresBtn);
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
        // TODO: Check and Update the My Store Pickup Action Here.
        await generateStoreListHTML(container);
        await initializePagination(container);
      }
      STORE_LIST_PAGINATION.style.display = 'flex';
    } else {
      resetStoreList();
      container.style.display = 'none';
      STORE_LIST_PAGINATION.style.display = 'none';
      const myStorePickupDivWrapper = document.querySelector('#hc-pc-my-store');
      if (myStorePickupDivWrapper) {
        myStorePickupDivWrapper.style.display = 'none';
      }
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

  let myStore = localStorage.getItem("defaultStore");
  if (myStore) {
    myStore = JSON.parse(myStore);
    const myStorePickupDivWrapper = document.getElementById('hc-pc-my-store');
    // Remove Previous My Store Listing, if the My Store isn't Changed
    const prevStoreDiv = myStorePickupDivWrapper.querySelector('.pickup-store-wrapper');
    if (prevStoreDiv) {
      prevStoreDiv.remove();
    }
    const payload = {};
    payload.enablePickup = container.dataset.showPickupHere === 'true';
    payload.productId = container.dataset.productId;
    payload.properties = {
      "_pickupstore": myStore.storeCode
    };
    payload.pickupItemPropertyLabel = container.dataset.pickupItemPropertyLabel;
    payload.pickupItemProperty = container.dataset.pickupItemProperty;

    const storesWithInventory = await filterStoresByInventoryAvailability([myStore], container.dataset.productSku);
    const isInStock = storesWithInventory && storesWithInventory.includes(myStore.storeCode);
    console.log("Does My Store has Inventory: ", isInStock);
    payload.isInStock = isInStock;

    const newMyStoreDiv = createPickupStoreDiv(myStore, payload);
    myStorePickupDivWrapper.appendChild(newMyStoreDiv);
    myStorePickupDivWrapper.style.display = 'block';
  }

  await generateStoreListHTML(container);
  await initializePagination(container);

  document.body.style.overflow = 'hidden';
}

function makePrevHandler(container) {
  return async function(event) {
    const next = document.getElementById('next-page');
    next.disabled = true;
    const prev = document.getElementById('prev-page');
    prev.disabled = true;
    let currentPage = parseInt(container.dataset.viewIndex, 10);
    if (currentPage > 0) {
      currentPage--;
      document.getElementById('page-info').textContent = `${currentPage + 1}`;
      container.dataset.viewIndex = currentPage;
      await generateStoreListHTML(container);
      next.disabled = false;
      prev.disabled = currentPage === 0;
    }
  };
}

function makeNextHandler(container) {
  return async function(event) {
    const next = document.getElementById('next-page');
    next.disabled = true;
    const prev = document.getElementById('prev-page');
    prev.disabled = true;
    let currentPage = parseInt(container.dataset.viewIndex, 10);
    let totalPages = parseInt(container.dataset.totalPages, 10);
    currentPage++;
    console.log("Total Pages: ", totalPages, " and current page: ", currentPage);
    if (currentPage === totalPages) {
      next.disabled = true;
    }
    if (currentPage < totalPages) {
      document.getElementById('page-info').textContent = `${currentPage + 1}`;
      container.dataset.viewIndex = currentPage;
      await generateStoreListHTML(container);
      prev.disabled = false;
      next.disabled = currentPage >= totalPages - 1;
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
  try {
    modal.style.display = "none";
    const searchBarInput = document.querySelector(
      "#hc-pickup-modal__search input"
    );
    if (searchBarInput) {
      searchBarInput.value = "";
    }
    resetStoreList();
  } catch (error) {
    console.error("Error while closing Pikcup Modal", error);
  }
  document.body.style.overflow = "scroll";
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

function closeMyStoreModal() {
  const myStoreModal = document.querySelector('my-store-modal');
  console.log("Closing My Store Modal...");
  myStoreModal.querySelector('#mystore-modal').scrollTop = 0;
  myStoreModal.style.display = 'none';
  document.body.style.overflow = 'scroll';
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
      if (!this.dataset.customerId) {
        const store = localStorage.getItem("defaultStore");
        return store ? JSON.parse(store) : undefined;
      }
      const response = await fetch(
        `https://dev-oms.hotwax.io/api/getShopifyCustomerDefaultStore?customerId=${this.dataset.customerId}&shopifyShopId=${this.dataset.storeId}`
      );

      const resp = await response.json();
      console.log("API response:", resp);

      if (!resp?.customer?.facilityId) {
        localStorage.removeItem("defaultStore");
      }

      const myStoreModal = document.querySelector('my-store-modal');
      const includeWarehouse = myStoreModal.dataset.showWarehouse;
      const storeSearchProximity = myStoreModal.dataset.storeSearchProximity;

      const payload = {};

      if (includeWarehouse) payload.includeWarehouse = includeWarehouse;
      if (storeSearchProximity) payload.distance = storeSearchProximity;
      payload.filters = [`storeCode: ${resp.customer.facilityId}`];

      const storeResponse = await getStoresByBaseCondition(payload);

      const store = storeResponse?.stores?.[0];
      console.log("Default store:", store);
      return store;

    } catch (err) {
      console.error("Error fetching customer default store:", err);
      return null;
    }
  }

  async setMyStore() {
    const myStoreDetailsWrapper = this.querySelector('#my-store-details');

    if (!myStoreDetailsWrapper) {
      console.warn("No #my-store-details wrapper found");
      return;
    }

    const store = await this.getCustomerDefaultStore();

    if (!store) {
      console.log("Store not found");
      const storeSelectText = document.createElement('span');
      storeSelectText.id = 'detail-text';
      storeSelectText.textContent = 'Select a Store';
      storeSelectText.style.cursor = 'pointer';
      myStoreDetailsWrapper.appendChild(storeSelectText);

      storeSelectText.addEventListener('click', () => this.openMyStoreModal());
      return;
    }
    
    localStorage.setItem("defaultStore", JSON.stringify(store));

    console.log("Store code:", store.storeCode);
    console.log("Store name:", store.storeName);

    const storeDetailText = document.createElement('span');
    storeDetailText.id = 'detail-text'
    storeDetailText.style.cursor = 'pointer';
    myStoreDetailsWrapper.appendChild(storeDetailText);

    const timings = getStoreTimings(store);
    console.log("Store timings:", timings);

    storeDetailText.textContent = `${store.storeName}${timings ? ` Open: ${timings}` : ''}`;

    storeDetailText.addEventListener('click', () => this.openMyStoreModal());
  }

  openMyStoreModal() {
    const modal = document.querySelector('my-store-modal');
    if (modal) {
      console.log("Here I am");
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
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
    await this.intialize();
    this.querySelector('#hc-ms-close-btn').addEventListener('click', () => { this.closeMyStoreModal(); });
  }

  async intialize () {
    try {
      const response = await getStoresByBaseCondition(this.getBaseConditionsForStoreLookup());
      console.log("Pickup stores:", response, " and ", response?.stores?.length);

      const stores = response?.stores;

      const modal = this.querySelector('#mystore-modal')
      const myStore = JSON.parse(localStorage.getItem("defaultStore"));

      console.log("This is my store", myStore); 

      if (myStore) {
        const myStoreHead = document.createElement('h3');
        myStoreHead.id = 'my-store-head';
        myStoreHead.textContent = 'My Store:';
        myStoreHead.style.fontWeight = 'bold';

        const defaultStore = this.createStoreDiv(myStore);
        defaultStore.id = 'selected-my-store';
        defaultStore.querySelector('.hc-ms-store-action')?.remove();
        modal.prepend(defaultStore);
        modal.prepend(myStoreHead);
        const customLine = document.createElement('hr');
        customLine.classList.add('custom-line');
        customLine.style.marginBottom = "20px";
        defaultStore.after(customLine);
      } else {
        const noStoreSelectedHead = document.createElement('h3');
        noStoreSelectedHead.textContent = 'No Store Selected';
        noStoreSelectedHead.id = 'my-store-head';
        modal.prepend(noStoreSelectedHead);
        noStoreSelectedHead.style.fontWeight = 'bold';
      }

      this.createStoreList(stores);
      const findStoresButton = modal.querySelector('.hc-modal-find-stores-btn');
      const locationIcon = modal.querySelector('#hc-ms-location-icon');

      findStoresButton?.addEventListener('click', async () => {
        try {
          // Prevent user to run this more than once simultaneously.
          findStoresButton.disabled = true;
          if (locationIcon.dataset.picklocation === 'true') {
            locationIcon.dataset.picklocation = 'false';
            locationIcon.src = 'assets/LocationIcon.svg';
          }
          const zipCodeInput = this.querySelector('#my-store-modal-zipcode-input').value;
          const storesByZip = await this.getStoresByZip(zipCodeInput);
          this.replaceStoreListDivAndHead(storesByZip?.stores);
        } catch (error) {
          console.error("Error is Search: ", error);
        }
        // Enable the button again
        findStoresButton.disabled = false;
      });

      locationIcon.addEventListener('click', async () => {
        try {
          findStoresButton.disabled = true;
          let stores = undefined;
          if (locationIcon.dataset.picklocation === 'false') {
            locationIcon.dataset.picklocation = 'true';
            locationIcon.src = '../assets/LocationFilledIcon.svg';
            stores = await this.getStoresByCurrentLocation();
          } 
          else {
            locationIcon.src = '../assets/LocationIcon.svg';
            locationIcon.dataset.picklocation = 'false';
            stores = await getStoresByBaseCondition(this.getBaseConditionsForStoreLookup());
          }
          // Clear any input in search bar
          this.querySelector('#my-store-modal-zipcode-input').value = '';

          this.replaceStoreListDivAndHead(stores?.stores);
        } catch (error) {
          console.error("Error in finding Nearby Stores: ", error);
        }

        findStoresButton.disabled = false;
      });
      
    } catch (err) {
      console.error("Error fetching pickup stores:", err);
    }
  }

  async reintialize () {
    this.querySelector('#my-store-head')?.remove();
    this.querySelector('#selected-my-store')?.remove();
    this.querySelector('#store-list-head')?.remove();
    this.querySelector('.hc-store-list')?.remove();
    this.querySelector('#my-store-modal-zipcode-input').value = '';
    const findStoresBtn = this.querySelector('.hc-modal-find-stores-btn');
    findStoresBtn.parentNode.replaceChild(findStoresBtn.cloneNode(true), findStoresBtn);
    const locationIcon = this.querySelector('#hc-ms-location-icon');
    locationIcon.parentNode.replaceChild(locationIcon.cloneNode(true), locationIcon);
    this.querySelector('.custom-line')?.remove();
    this.intialize();
  }

  disconnectedCallback() {
    console.log("MyStoreModal element removed from the DOM");
  }

  async setShopifyCustomerDefaultStore(store) {
    console.log("Setting default store");
    if (!store) {
      console.log("Empty Input!")
      return;
    }

    console.log(this.dataset.customerId, " and ", this.dataset.shopId);
    if (this.dataset.customerId && this.dataset.shopId) {
      await fetch(`https://dev-oms.hotwax.io/api/setShopifyCustomerDefaultStore`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          'customerId': this.dataset.customerId,
          'shopifyShopId': this.dataset.shopId,
          'facilityId': store.storeCode
        })
      })
    }
    this.dataset.storeCode = store.storeCode;
    
    console.log("Setting up done for default store");
  }

  createStoreList(stores) {

    if (!stores) {
      console.log("Empty List passed.");
      return;
    }

    const storeListDiv = document.createElement('div');
    storeListDiv.classList.add('hc-store-list');
    const myStore = JSON.parse(localStorage.getItem("defaultStore"));
    const modal = this.querySelector("#mystore-modal");
    stores.forEach(store => {
      const showHomeStoreInSearch = this.dataset.showHomeStoreInSearch === 'true';
      const storeDiv = this.createStoreDiv(store);
      if (myStore && !showHomeStoreInSearch && store.storeCode === myStore.storeCode) {
        storeDiv.classList.add('hc-hide');
      }
      storeListDiv.appendChild(storeDiv);

      const customLine = document.createElement('hr');
      customLine.classList.add('custom-line');
      storeListDiv.appendChild(customLine);
      if (myStore && !showHomeStoreInSearch && store.storeCode === myStore.storeCode) {
        customLine.classList.add('hc-hide');
      }
    });
    const storeListHeadText = myStore ? 'Other Stores: ' : 'Select a Store: ';
    const storeListHead = document.createElement('h3');
    storeListHead.id = 'store-list-head';
    storeListHead.textContent = storeListHeadText;
    storeListHead.style.fontWeight = "bold";
    modal.appendChild(storeListHead);
    modal.appendChild(storeListDiv);
    return storeListDiv;
  }

  replaceStoreListDivAndHead (stores) {
    const oldStoreListDiv = this.querySelector('.hc-store-list');
    this.querySelector('#store-list-head')?.remove();
    const newStoreListDiv = this.createStoreList(stores);
    oldStoreListDiv?.remove();
  }

  createStoreDiv(store) {
    const storeName = document.createElement('h3');
    storeName.textContent = store.storeName;

    const storeAddress = document.createElement('p');
    storeAddress.textContent = store.address1;

    const storeFullAddress = document.createElement('p')
    storeFullAddress.textContent = [store.city, store.postalCode, store.countryCode].filter(Boolean).join(', ');

    const storeDetails = document.createElement('div');
    storeDetails.classList.add('store-details');
    storeDetails.appendChild(storeName);
    storeDetails.appendChild(storeAddress);
    storeDetails.appendChild(storeFullAddress);

    const storeContacts = document.createElement('div');
    storeContacts.classList.add('store-inv-contacts');

    if (store.storePhone) {
      const phoneSpan = document.createElement('span');
      const phoneIconImg = document.createElement('img');
      phoneIconImg.classList.add('hc-icon');
      phoneIconImg.src = '../assets/PhoneIcon.svg'
      phoneSpan.appendChild(phoneIconImg);
      const storePhoneNum = document.createElement('span');
      storePhoneNum.textContent = store.storePhone;

      phoneSpan.appendChild(storePhoneNum);
      storeContacts.appendChild(phoneSpan);
    }

    const timing = getStoreTimings(store);

    if (this.dataset.showTimings === 'true' && timing) {

      const timingSpan = document.createElement('span');
      const clockIcon = document.createElement('img');
      clockIcon.classList.add('hc-icon');
      clockIcon.src = '../assets/ClockIcon.svg';
      timingSpan.appendChild(clockIcon);
      const storeTimings = document.createElement('span');
      storeTimings.textContent = `Open Today: ${timing}`;
      timingSpan.appendChild(storeTimings);
      storeContacts.appendChild(timingSpan);
    }

    const myStore = JSON.parse(localStorage.getItem("defaultStore"));

    // If customer has no default store
    // If store being added to list is not my store
    if (!myStore || myStore.storeCode !== store.storeCode) {
      let setStoreAction = document.createElement('p');
      setStoreAction.textContent ='Store Pickup Unavailable Here';
      if (store.pickup_pref === 'true') {
        setStoreAction = document.createElement('u');
        setStoreAction.textContent ='SET AS MY STORE';
        setStoreAction.style.cursor = 'pointer'

        setStoreAction.addEventListener('click', () => {
          this.updateMyStore(store);
        });
      }

      setStoreAction.classList.add('hc-ms-store-action');
      storeDetails.appendChild(setStoreAction);
    }

    const storeDiv = document.createElement('div');
    storeDiv.classList.add('store');
    storeDiv.id = store.storeCode;
    storeDiv.appendChild(storeDetails);
    if (storeContacts.childElementCount) {
     storeDiv.appendChild(storeContacts); 
    } else {
      storeContacts.remove();
      storeDetails.style.maxWidth = 'none';
    }

    return storeDiv;
  }

  updateMyStore(selectedMyStore) {

    // Validate the Input
    if (!selectedMyStore) {
      console.log("Empty Value Passed");
      return;
    }

    const modal = document.querySelector('#mystore-modal');

    // Clear Previous My Store
    modal.querySelector('#selected-my-store')?.remove();
    // Create a new Store div
    const newSelectedMyStoreDiv = this.createStoreDiv(selectedMyStore);
    newSelectedMyStoreDiv.id = 'selected-my-store';
    newSelectedMyStoreDiv.querySelector('.hc-ms-store-action')?.remove();
    const customLine = document.createElement('hr');
    customLine.classList.add('custom-line');
    customLine.style.marginBottom = "20px";
    newSelectedMyStoreDiv.after(customLine);

    modal.prepend(newSelectedMyStoreDiv);

    const myStoreHead = modal.querySelector('#my-store-head');
    myStoreHead.textContent = 'My Store:';
    modal.prepend(myStoreHead);
    
    // Save the prevMyStore before updating the my Store in the localstorage
    // If no store was selected then set it as previous store.
    const prevMyStore = JSON.parse(localStorage.getItem("defaultStore")) || selectedMyStore;
    localStorage.setItem("defaultStore", JSON.stringify(selectedMyStore));
    const storeListDiv = this.querySelector('.hc-store-list');

    const prevMyStoreDiv = storeListDiv.querySelector(`#${CSS.escape(prevMyStore.storeCode)}`);

    // My Store could or could not be included in the store list, based on app embed block setting.
    if (prevMyStore.storeCode !== selectedMyStore.storeCode && prevMyStoreDiv) {
      const setStoreAction = document.createElement('u');
      setStoreAction.textContent = 'SET AS MY STORE';
      setStoreAction.style.cursor = 'pointer';
      setStoreAction.classList.add('hc-ms-store-action');

      setStoreAction.addEventListener('click', () => {
        this.updateMyStore(prevMyStore);
      });

      prevMyStoreDiv.querySelector('.store-details')?.appendChild(setStoreAction);
    }

    const selectedMyStoreDiv = storeListDiv.querySelector(`#${CSS.escape(selectedMyStore.storeCode)}`);
    selectedMyStoreDiv.querySelector('.hc-ms-store-action').remove();

    this.setShopifyCustomerDefaultStore(selectedMyStore);

    const myStoreBlockDetails = document.querySelector('my-store').querySelector('#my-store-details');
    const storeTimings = getStoreTimings(selectedMyStore);
    myStoreBlockDetails.querySelector('#detail-text').textContent = `${selectedMyStore.storeName}${storeTimings ? ` Open: ${storeTimings}` : ''}`;
    const showMyStoreInSearch = this.dataset.showHomeStoreInSearch === 'true';
    if (!showMyStoreInSearch) {
      selectedMyStoreDiv.classList.add('hc-hide');
      const customLine =  selectedMyStoreDiv.nextElementSibling;

      if (customLine.tagName === 'HR') {
        customLine.classList.add('hc-hide');
      }

      if (prevMyStoreDiv.id !== selectedMyStoreDiv.id) {
        prevMyStoreDiv.classList.remove('hc-hide');
        const prevMyStoreCustomLine = prevMyStoreDiv.nextElementSibling;
        if (prevMyStoreCustomLine.tagName === 'HR') {
          prevMyStoreCustomLine.classList.remove('hc-hide');
        }
      }
    }
    this.closeMyStoreModal();

    this.updateMyStoreInPickup(selectedMyStore);
  }

  async updateMyStoreInPickup (selectedMyStore) {

    if (pickupBlockSettings?.storeSelectorDisplay !== 'inline') {
      console.log("Pickup Block is not inline, returning...");
      return;
    }
    // Is Theme's maintainer has enabled both Inline Pickup Block and the Pickup Modal Embed Block then get the one Store List which is inline and get it's dataset.
    let storeListElement = document.querySelector('#store-list[data-store-selector-display="inline"]');

    // It is possible that the my Store is being updated on other page than PDP, in case we don't 
    if (!storeListElement) {
      console.warn('No Store List Elements found!');
      return;
    }

    console.log("These are store list: ", storeListElement.dataset);

    // Extension running when pickup is in Modal Store Selector Display.
    if (!storeListElement) {
      console.log('Inline Store List not Found');
      return;
    }

    const storesWithInventory = await filterStoresByInventoryAvailability([selectedMyStore], selectedProductVariant?.sku);

    console.log("Does My Store has Inventory : ", storesWithInventory);

    const isInStock = storesWithInventory.length ? true : false;

    const payload = {
      isInStock: isInStock,
      properties: {
        "_pickupstore": selectedMyStore.storeCode
      }
    }

    const newMyStoreDiv = createInlineMyStorePickupHead(selectedMyStore, payload);

    const myStorePickupWrapper = document.querySelector('#hc-pc-my-store');
    const myStoreDiv = myStorePickupWrapper.querySelector('.hc-pc-mystore-pickup');


    const showAndHideStoresBtn = document.querySelector('#show-inline-stores-btn');
    console.log("This is show and hide stores button", showAndHideStoresBtn);
    showAndHideStoresBtn.dataset.showStores = 'false';
    showAndHideStoresBtn.textContent = 'CHECK OTHER STORES';
    paginationElement.style.display = 'none';
    storeListElement.style.display = 'none';
    resetStoreList();

    if (myStoreDiv) {
      myStorePickupWrapper.replaceChild(newMyStoreDiv, myStoreDiv);
      return;
    }
    myStorePickupWrapper.appendChild(newMyStoreDiv);
    myStorePickupWrapper.style.display = 'block';
    
  }

  async getStoresByCurrentLocation () {
    const position = await getCurrentLocation();

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    const payload = this.getBaseConditionsForStoreLookup();

    console.log("This is payload from currecnt location search function: ", payload);

    if (lat && lon) {
      payload.point = `${lat},${lon}`;
    } else {
      console.error("No Stores to lookup!");
      return;
    }

    return await getStoresByBaseCondition(payload);
  }

  async getStoresByZip (zipcode) {

    const { lat, lon } = await getLatLon(zipcode);

    const payload = this.getBaseConditionsForStoreLookup();

    if (lat && lon) {
      payload.point = `${lat},${lon}`;
    } else {
      console.error("No Stores to lookup!");
      return;
    }

    return await getStoresByBaseCondition(payload);
  }

  getBaseConditionsForStoreLookup () {
    const showWarehouse = this.dataset.showWarehouse;
    const storeSearchProximity = this.dataset.storeSearchProximity;

    console.log(showWarehouse, ' and ', storeSearchProximity);

    const payload = {};

    if (showWarehouse) payload.includeWarehouse = showWarehouse;
    if (storeSearchProximity) payload.distance = storeSearchProximity;

    return payload;
  }

  closeMyStoreModal () {
    console.log("Closing My Store Modal...");
    this.querySelector('#mystore-modal').scrollTop = 0;
    this.style.display = 'none';
    document.body.style.overflow = 'scroll';
    this.reintialize();
  }
}

if (!customElements.get("my-store")) {
  customElements.define("my-store", MyStore);
}

if (!customElements.get("my-store-modal")) {
  customElements.define("my-store-modal", MyStoreModal);
}

