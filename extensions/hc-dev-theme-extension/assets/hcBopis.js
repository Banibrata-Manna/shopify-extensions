// TODO: Implement Searching Stores by partial zipcode.
async function getStores(viewSize, viewIndex, point, distance) {
  let stores = [];
  let storesFound;
  let requestBody = {};
  try {
  if (!point) {
    const position = await getCurrentLocation();
    point = `${position.coords.latitude},${position.coords.longitude}`;
  }
  if (distance) {
    requestBody.distance = distance;
  }
  requestBody.viewSize = viewSize;
  requestBody.viewIndex = viewIndex;
  requestBody.point = point;
  requestBody.filters = ["pickup_pref: true", "storeType: RETAIL_STORE"];
  requestBody.sortBy = "storeName asc";

  } catch (error) {
    console.error("Error getting location:", error.message);
    return stores; // return empty if location fails
  }

  try {
    const response = await fetch('Maarg Store Lookup URL', {
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
    return 'Store Timings Not Available';
  }

  return `${formatTime24to12(open)} - ${formatTime24to12(close)}`;
}


function getCurrentLocation() {
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
    const response = await fetch(`Maarg Post Code Lookup URL`, {
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

async function searchStoresByZip(zipcode) {
  const { lat, lon } = await getLatLon(zipcode);
  resetStoreList();
  if (!lat || !lon) {
    return;
  }
  const storeListContainer = document.getElementById('store-list');
  if (!storeListContainer) return;
  storeListContainer.dataset.point = `${lat},${lon}`;
  storeListContainer.dataset.viewIndex = 0;
  await generateStoreListHTML(storeListContainer);
  await initializePagination(storeListContainer);
}

function addToCart(currentVariantId, quantity = 1) {
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
          quantity: quantity
        }
      ]
    })
  })
  .then(response => response.json())
  .then(data => {
    // TODO: Update cart UI
    console.log('Added to cart:', data);
  })
  .catch(error => {
    alert('Could not add to cart', error);
  });
}

async function checkPickupInventory(payload) {
  const response = await fetch('Maarg BOPIS Inventory Check URL', {
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
  payload.productStoreId = '<Product Store ID>';
  payload.inventoryGroupId = '<Inventory Group ID>';

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

  console.log("This is the Variant ID : ", container.dataset.productId);
const storeActions = enablePickup
  ? `<div class="store-actions">
       <button id="pickup-btn" class="btn"
         onClick="addToCart(${Number(container.dataset.productId)}, 1)">
         Pickup Here
       </button>
     </div>`
  : '';


  const viewIndex = container.dataset.viewIndex;
  const maxStoresToShow = parseInt(container.dataset.maxStoresDisplay, 10) || 5;
  const response = await getStores(maxStoresToShow, viewIndex, container.dataset.point, container.dataset.storeProximity);
  const stores = response.stores;
  const storesFound = response.storesFound;
  container.dataset.totalPages = Math.ceil(storesFound / maxStoresToShow);

  if (storesFound === 0) {
    container.innerHTML = '<p>No stores found</p>';
    // const pagination = document.querySelector('#pagination');
    // if (pagination) {
    //   pagination.style.display = 'none';
    // }
    return;
  }

  const storesWithInventory = await filterStoresByInventoryAvailability(stores, container.dataset.productSku);
  console.log("Stores with inventory: ", storesWithInventory);
  stores.forEach(store => {
  const storeName = store.storeName || '';
  const address1 = store.address1 || '';
  const city = store.city || '';
  const postalCode = store.postalCode || '';
  const countryCode = store.countryCode || '';
  const phone = store.storePhone || 'Phone Number Not Available';
  const timings = getStoreTimings(store);
  const inStock = storesWithInventory?.includes(store.storeCode);

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
        ${timings ? `<p>Open Today: ${timings}</p>` : ''}
      </div>
    </div>
    ${inStock ? storeActions : ''}
    <hr class="custom-line">
  `;

  container.insertAdjacentHTML('beforeend', html);
});
}

document.addEventListener('DOMContentLoaded', async function () {    
    var container = document.getElementById('store-list');
    if (container && container.dataset.storeSelectorDisplay === 'inline') {
      container.dataset.viewIndex = 0;
      await generateStoreListHTML(container);
      await initializePagination(container);
    }
});

document.addEventListener('shopify:variant:changed', function(event) {
  const selectedVariant = event.detail.variant;
  const container = document.getElementById('store-list');
  console.log("Selected variant changed: ", selectedVariant?.id);

  if (container && selectedVariant) {
    container.dataset.productId = selectedVariant.id;
    container.dataset.productSku = selectedVariant.sku;
    container.dataset.productTitle = selectedVariant.title;
  }
});

async function showPickupModal(enablePickup, maxStoresToShow, storeProximity) {
  const modal = document.getElementById('pickup-modal-embed');
  if (!modal) return;

  modal.style.display = 'block';

  const container = document.getElementById('store-list');
  if (!container) return;

  // TODO: These need to set while rendering the app-embed block instead
  container.dataset.showPickupHere = enablePickup;
  container.dataset.maxStoresDisplay = maxStoresToShow;
  container.dataset.viewIndex = 0;
  container.dataset.storeSelectorDisplay = 'modal';
  container.dataset.storeProximity = storeProximity;

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
    if (currentPage < totalPages) {
      currentPage++;
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
  // document.getElementById('pagination').style.display = 'flex';
}

function closePickupModal() {
  const modal = document.getElementById("pickup-modal-embed");
  if (modal) {
    modal.style.display = "none";
    const searchBarInput = document.querySelector(
      ".pickup-modal__search input"
    );
    if (searchBarInput) {
      searchBarInput.value = "";
    }
    resetStoreList();
  }
}


function resetStoreList() {
  const container = document.getElementById('store-list');
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
