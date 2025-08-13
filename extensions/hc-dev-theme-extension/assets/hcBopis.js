// TODO: Implement Searching Stores by lat, lon & zipcode.
async function getStores() {
  let stores = [];

  await fetch('<storeLookup url of oms instance>', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        viewSize: 10,
        filters: ["pickup_pref: true", "storeType: RETAIL_STORE"],
        sortBy: "storeName asc",
        fieldsToSelect: "storeName, , address1, countryCode, postalCode, city"
    })
  })
    .then(response => response.json())
    .then(data => {
      stores = data?.response?.docs;
    })
    .catch(error => {
      console.error('Error fetching stores:', error);
    });
    return stores;
}

async function generateStoreListHTML(container, enablePickup) {
  const storeActions = enablePickup
      ? `<div class="store-actions">
           <button id="pickup-btn" class="btn">Pickup Here</button>
         </div>`
      : '';

  const stores = await getStores();
  stores.forEach(store => {
  const storeName = store.storeName || '';
  const address1 = store.address1 || '';
  const city = store.city || '';
  const postalCode = store.postalCode || '';
  const countryCode = store.countryCode || '';
  const phone = store.phone || '';
  const timings = store.timings || '';

  const html = `
    <div class="store">
      <div class="store-details">
        ${storeName ? `<h3 class="store-name">${storeName}</h3>` : ''}
        ${address1 ? `<p>${address1}</p>` : ''}
        ${(city || postalCode || countryCode) ? `<p>${[city, postalCode, countryCode].filter(Boolean).join(', ')}</p>` : ''}
      </div>
      <div class="store-inv-contacts">
        <p>In Stock</p>
        ${phone ? `<p>Phone: ${phone}</p>` : ''}
        ${timings ? `<p>Open Today: ${timings}</p>` : ''}
      </div>
    </div>
    ${storeActions}
    <hr class="custom-line">
  `;

  container.insertAdjacentHTML('beforeend', html);
});
}

document.addEventListener('DOMContentLoaded', async function () {    
    var container = document.getElementById('store-list');
    if (container) {
      var showPickupHere = container.dataset.showPickupHere;
      await generateStoreListHTML(container, showPickupHere === "true");
    }
});

async function showPickupModal(enablePickup) {
  const modal = document.getElementById('pickup-modal-embed');
  if (!modal) return;

  modal.style.display = 'block';

  const container = document.getElementById('store-list');
  if (!container) return;

  container.innerHTML = '';

  await generateStoreListHTML(container, enablePickup);
}

function closePickupModal() {
  const modal = document.getElementById('pickup-modal-embed');
  if (modal) {
    modal.style.display = 'none';
  }
}