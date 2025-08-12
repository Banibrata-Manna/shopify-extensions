function getStores() {
    return [
        {
            name: "Demo Store", address: "Demo Address", timings: "10 AM - 9 PM", "city": "Aventura",
            "postalCode": "33180",
            "country": "United States",
            "countryCode": "US",
            "state": "Florida"
        },
        {
            name: "Another Store", address: "Another Address", timings: "9 AM - 8 PM", "city": "Miami",
            "postalCode": "33101",
            "country": "United States",
            "countryCode": "US",
            "state": "Florida"
        },
        {
            name: "Third Store", address: "Third Address", timings: "11 AM - 7 PM", "city": "Orlando",
            "postalCode": "32801",
            "country": "United States",
            "countryCode": "US",
            "state": "Florida"
        }
    ];
}

document.addEventListener('DOMContentLoaded', function () {
    var stores = getStores();
    var container = document.getElementById('store-list');
    if (container) {
        var showPickupHere = container.dataset.showPickupHere
        stores.forEach(function (store) {
            const storeActions = showPickupHere === "true"
                ? `<div class="store-actions">
                <button id="pickup-btn" class="btn">Pickup Here</button>
                <p>In Stock</p>
            </div>` : '';

            const html = `
                <div class="store">
                    <h3 class="store-name">${store.name}</h3>
                    <p>${store.address}</p>
                    <p>Open Today: ${store.timings}</p>
                </div>
                ${storeActions}
                <hr class="custom-line">
            `;

            container.insertAdjacentHTML('beforeend', html);

        });
    }
});

function showPickupModal(enablePickup) {
  const modal = document.getElementById('pickup-modal-embed');
  if (!modal) return;

  modal.style.display = 'block';

  const container = document.getElementById('store-list');
  if (!container) return;

  container.innerHTML = '';
  
  const stores = getStores();
  stores.forEach(store => {
    const storeActions = enablePickup
      ? `<div class="store-actions">
           <button id="pickup-btn" class="btn">Pickup Here</button>
           <p>In Stock</p>
         </div>`
      : '';

    const html = `
      <div class="store">
        <h3 class="store-name">${store.name}</h3>
        <p>${store.address}</p>
        <p>Open Today: ${store.timings}</p>
      </div>
      ${storeActions}
      <hr class="custom-line">
    `;
    container.insertAdjacentHTML('beforeend', html.trim());
  });
}

function closePickupModal() {
  const modal = document.getElementById('pickup-modal-embed');
  if (modal) {
    modal.style.display = 'none';
  }
}