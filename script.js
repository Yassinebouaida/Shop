// تهيئة Dexie (IndexedDB)
const db = new Dexie('TemuBatchDB');
db.version(1).stores({
    batches: '++id, name, date, totalCost, totalProfit',
    orders: '++id, batchId, customerName, phone, city, notes, productDesc, purchasePrice, sellingPrice, deliveryCost, status, autoCode, images'
});

let currentImages = []; // لتخزين الصور المؤقتة عند الإضافة

// دوال مساعدة
async function loadBatchesToSelect(selectEl, includeAll = true) {
    const batches = await db.batches.toArray();
    selectEl.innerHTML = '';
    if (includeAll) selectEl.innerHTML += '<option value="">كل الدفعات</option>';
    batches.forEach(b => {
        selectEl.innerHTML += `<option value="${b.id}">${b.name} (${new Date(b.date).toLocaleDateString()})</option>`;
    });
}

async function updateStats() {
    const batches = await db.batches.toArray();
    const orders = await db.orders.toArray();
    const delivered = orders.filter(o => o.status === 'delivered');
    const totalProfit = orders.reduce((sum, o) => sum + (o.sellingPrice - o.purchasePrice - (o.deliveryCost||0)), 0);
    document.getElementById('stat-batches').innerText = batches.length;
    document.getElementById('stat-orders').innerText = orders.length;
    document.getElementById('stat-delivered').innerText = delivered.length;
    document.getElementById('stat-profit').innerText = totalProfit.toFixed(2);
    // عرض آخر دفعات
    const recent = batches.slice(-3).reverse();
    const container = document.getElementById('recent-batches-list');
    if(container) container.innerHTML = recent.map(b => `<div class="batch-card">${b.name} - التكلفة: ${b.totalCost} د.ل - الربح: ${b.totalProfit}</div>`).join('');
}

async function renderBatches() {
    const batches = await db.batches.toArray();
    const container = document.getElementById('batches-list');
    if(!container) return;
    if(batches.length === 0) { container.innerHTML = '<p>لا توجد دفعات، أنشئ دفعة جديدة</p>'; return; }
    let html = '';
    for(const batch of batches) {
        const orders = await db.orders.where('batchId').equals(batch.id).toArray();
        const totalCost = orders.reduce((s,o)=> s + o.purchasePrice,0);
        const totalProfit = orders.reduce((s,o)=> s + (o.sellingPrice - o.purchasePrice - (o.deliveryCost||0)),0);
        // تحديث تكلفة الدفعة في DB
        await db.batches.update(batch.id, { totalCost, totalProfit });
        html += `<div class="batch-card">
                    <div><strong>${batch.name}</strong> - ${new Date(batch.date).toLocaleDateString()}</div>
                    <div>التكلفة: ${totalCost} د.ل | الربح: ${totalProfit} د.ل</div>
                    <div>عدد الطلبات: ${orders.length}</div>
                    <button class="small-btn delete-batch" data-id="${batch.id}">حذف</button>
                </div>`;
    }
    container.innerHTML = html;
    document.querySelectorAll('.delete-batch').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            if(confirm('حذف الدفعة سيحذف جميع طلباتها، هل أنت متأكد؟')) {
                await db.orders.where('batchId').equals(id).delete();
                await db.batches.delete(id);
                renderBatches();
                loadBatchesToSelect(document.getElementById('orderBatch'));
                loadBatchesToSelect(document.getElementById('filterBatch'));
                loadBatchesToSelect(document.getElementById('sortingBatchSelect'));
                updateStats();
            }
        });
    });
}

async function renderOrders(filterBatch='', filterStatus='', filterCustomer='') {
    let orders = await db.orders.toArray();
    if(filterBatch) orders = orders.filter(o => o.batchId == filterBatch);
    if(filterStatus) orders = orders.filter(o => o.status === filterStatus);
    if(filterCustomer) orders = orders.filter(o => o.customerName.includes(filterCustomer));
    const container = document.getElementById('orders-list-container');
    if(!container) return;
    if(orders.length === 0) { container.innerHTML = '<p>لا توجد طلبات</p>'; return; }
    let html = '';
    for(const order of orders) {
        const batch = await db.batches.get(order.batchId);
        const profit = order.sellingPrice - order.purchasePrice - (order.deliveryCost||0);
        html += `<div class="order-card" data-id="${order.id}">
                    <div class="order-header">
                        <span class="order-code">${order.autoCode}</span>
                        <span class="order-status status-${order.status}">${getStatusText(order.status)}</span>
                    </div>
                    <div><strong>${order.customerName}</strong> - ${order.city||''} - ${order.phone||''}</div>
                    <div>المنتج: ${order.productDesc.substring(0,50)}</div>
                    <div>الشراء: ${order.purchasePrice} | البيع: ${order.sellingPrice} | التوصيل: ${order.deliveryCost} | الربح: ${profit}</div>
                    <div class="order-images-mini">${renderMiniImages(order.images)}</div>
                    <div style="margin-top:8px;">
                        <select class="status-update" data-id="${order.id}">
                            ${statusOptions(order.status)}
                        </select>
                        <button class="small-btn copy-wa" data-name="${order.customerName}" data-code="${order.autoCode}" data-phone="${order.phone}">نسخ رسالة واتساب</button>
                        <button class="small-btn delete-order" data-id="${order.id}">حذف</button>
                    </div>
                </div>`;
    }
    container.innerHTML = html;
    // أحداث تغيير الحالة
    document.querySelectorAll('.status-update').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const orderId = parseInt(sel.dataset.id);
            const newStatus = sel.value;
            await db.orders.update(orderId, { status: newStatus });
            renderOrders(filterBatch, filterStatus, filterCustomer);
            updateStats();
        });
    });
    document.querySelectorAll('.delete-order').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            if(confirm('حذف الطلب؟')) {
                await db.orders.delete(id);
                renderOrders(filterBatch, filterStatus, filterCustomer);
                updateStats();
            }
        });
    });
    document.querySelectorAll('.copy-wa').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const name = btn.dataset.name;
            const code = btn.dataset.code;
            const phone = btn.dataset.phone;
            const msg = `السلام عليكم ${name}، رقم طلبك: ${code}، تم تجهيز طلبك. للاستفسار: ${phone}`;
            navigator.clipboard.writeText(msg);
            alert('تم نسخ الرسالة');
        });
    });
}

function getStatusText(s) {
    const map = { 'pending':'تم الطلب', 'shipping':'في الشحن', 'arrived':'وصل', 'sorted':'تم التفريق', 'delivered':'تم التسليم', 'cancelled':'ملغي' };
    return map[s] || s;
}
function statusOptions(current) {
    const all = ['pending','shipping','arrived','sorted','delivered','cancelled'];
    return all.map(s => `<option value="${s}" ${current===s ? 'selected':''}>${getStatusText(s)}</option>`).join('');
}
function renderMiniImages(imagesBlobs) {
    if(!imagesBlobs || !imagesBlobs.length) return '';
    let html = '';
    imagesBlobs.forEach(blob => {
        const url = URL.createObjectURL(blob);
        html += `<img src="${url}" class="preview-img" data-url="${url}" style="width:45px;height:45px;">`;
    });
    return html;
}

// إدارة التفريق
async function renderSortingOrders() {
    const batchId = document.getElementById('sortingBatchSelect').value;
    if(!batchId) { document.getElementById('sortingOrdersList').innerHTML = '<p>اختر دفعة أولاً</p>'; return; }
    let orders = await db.orders.where('batchId').equals(parseInt(batchId)).toArray();
    const container = document.getElementById('sortingOrdersList');
    if(orders.length===0){ container.innerHTML='<p>لا توجد طلبات في هذه الدفعة</p>'; return; }
    let html = '';
    for(const order of orders) {
        const profit = order.sellingPrice - order.purchasePrice - (order.deliveryCost||0);
        html += `<div class="sorting-order-item ${order.status==='sorted'?'sorted-bg':''}" style="border-right-color:${order.status==='sorted'?'green':'#1e3c72'}">
                    <div><strong>${order.autoCode}</strong> - ${order.customerName} - ${order.city}</div>
                    <div>المنتج: ${order.productDesc}</div>
                    <div class="order-images-mini">${renderMiniImages(order.images)}</div>
                    <div>الربح: ${profit}</div>
                    ${order.status !== 'sorted' ? `<button class="btn-primary mark-sorted" data-id="${order.id}">تم التفريق</button>` : '<span class="sorted-badge">تم التفريق ✓</span>'}
                </div>`;
    }
    container.innerHTML = html;
    document.querySelectorAll('.mark-sorted').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            await db.orders.update(id, { status: 'sorted' });
            renderSortingOrders();
            updateStats();
        });
    });
}

// إضافة دفعة جديدة
document.getElementById('newBatchBtn')?.addEventListener('click', async () => {
    const name = prompt('اسم الدفعة (مثال: دفعة مارس 2025)');
    if(!name) return;
    const id = await db.batches.add({ name, date: new Date(), totalCost: 0, totalProfit: 0 });
    renderBatches();
    loadBatchesToSelect(document.getElementById('orderBatch'));
    loadBatchesToSelect(document.getElementById('filterBatch'));
    loadBatchesToSelect(document.getElementById('sortingBatchSelect'));
    updateStats();
});

// حفظ الطلب الجديد
document.getElementById('orderForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const batchId = parseInt(document.getElementById('orderBatch').value);
    if(!batchId) { alert('اختر دفعة'); return; }
    const customerName = document.getElementById('customerName').value;
    const phone = document.getElementById('customerPhone').value;
    const city = document.getElementById('customerCity').value;
    const notes = document.getElementById('customerNotes').value;
    const productDesc = document.getElementById('productDesc').value;
    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value);
    const sellingPrice = parseFloat(document.getElementById('sellingPrice').value);
    const deliveryCost = parseFloat(document.getElementById('deliveryCost').value) || 0;
    // حساب الكود التلقائي: B{رقم الدفعة}-C{عدد طلبات الدفعة+1}
    const ordersInBatch = await db.orders.where('batchId').equals(batchId).count();
    const autoCode = `B${batchId}-C${ordersInBatch+1}`;
    // معالجة الصور
    const files = document.getElementById('orderImages').files;
    const imageBlobs = [];
    for(let i=0; i<Math.min(files.length,5); i++) {
        const blob = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => fetch(e.target.result).then(r=>r.blob()).then(resolve);
            reader.readAsDataURL(files[i]);
        });
        imageBlobs.push(blob);
    }
    await db.orders.add({
        batchId, customerName, phone, city, notes, productDesc, purchasePrice, sellingPrice, deliveryCost,
        status: 'pending', autoCode, images: imageBlobs
    });
    alert('تم إضافة الطلب');
    document.getElementById('orderForm').reset();
    currentImages = [];
    document.getElementById('imagePreviewContainer').innerHTML = '';
    renderOrders();
    updateStats();
    renderBatches();
});

// معاينة الصور
document.getElementById('orderImages')?.addEventListener('change', (e) => {
    const preview = document.getElementById('imagePreviewContainer');
    preview.innerHTML = '';
    Array.from(e.target.files).slice(0,5).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.createElement('img');
            img.src = ev.target.result;
            img.classList.add('preview-img');
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

// تكبير الصورة
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('preview-img')) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        modal.style.display = 'flex';
        modalImg.src = e.target.src;
    }
});
document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('imageModal').style.display = 'none';
});

// التنقل بين الصفحات
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const pageId = btn.dataset.page + '-page';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // تحديث البيانات عند الانتقال
        if(pageId === 'batches-page') renderBatches();
        if(pageId === 'orders-page') renderOrders();
        if(pageId === 'sorting-page') renderSortingOrders();
        if(pageId === 'dashboard-page') updateStats();
        if(pageId === 'add-order-page') loadBatchesToSelect(document.getElementById('orderBatch'), false);
    });
});

// تحميل الفلاتر
async function initFilters() {
    await loadBatchesToSelect(document.getElementById('filterBatch'));
    document.getElementById('filterBatch').addEventListener('change', () => {
        renderOrders(document.getElementById('filterBatch').value, document.getElementById('filterStatus').value, document.getElementById('filterCustomer').value);
    });
    document.getElementById('filterStatus').addEventListener('change', () => {
        renderOrders(document.getElementById('filterBatch').value, document.getElementById('filterStatus').value, document.getElementById('filterCustomer').value);
    });
    document.getElementById('filterCustomer').addEventListener('input', () => {
        renderOrders(document.getElementById('filterBatch').value, document.getElementById('filterStatus').value, document.getElementById('filterCustomer').value);
    });
    document.getElementById('clearFilters')?.addEventListener('click', () => {
        document.getElementById('filterBatch').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterCustomer').value = '';
        renderOrders('','','');
    });
}

// التهيئة
(async function init() {
    await initFilters();
    await loadBatchesToSelect(document.getElementById('orderBatch'), false);
    await loadBatchesToSelect(document.getElementById('sortingBatchSelect'), false);
    document.getElementById('sortingBatchSelect').addEventListener('change', renderSortingOrders);
    await renderBatches();
    await renderOrders();
    await updateStats();
    // الوضع الليلي
    if(window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark');
})();
