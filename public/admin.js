// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const editModal = document.getElementById('editModal');
const deleteModal = document.getElementById('deleteModal');
const editForm = document.getElementById('editForm');
const modalFields = document.getElementById('modalFields');
const notification = document.getElementById('notification');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

let currentItem = null;
let currentAction = null;

/* Admin auth via server token (see js/dg-api.js) */

const adminLoginContainer = document.getElementById('adminLoginContainer');
const adminDashboardContainer = document.getElementById('adminDashboardContainer');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginError = document.getElementById('adminLoginError');

// Show notification function
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.error('Notification element not found');
        return;
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Tab Navigation
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');
        
        // Load data for the selected tab
        loadTabData(tabName);
    });
});

// Load data for each tab
async function loadTabData(tabName) {
    try {
        if (tabName === 'payments') {
            await loadPaymentsWithFiltering();
            return;
        }
        
        if (tabName === 'orders') {
            await loadOrdersWithFiltering();
            return;
        }

        if (tabName === 'settlements') {
            await loadSettlementsWithFiltering();
            return;
        }
        
        const response = await DgApi.apiFetch(`/api/admin/${tabName}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new TypeError("Received non-JSON response from server");
        }
        const data = await response.json();
            updateTable(tabName, data);
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification(`Failed to load ${tabName}: ${error.message}`, 'error');
        // Clear the table if there's an error
        const tbody = document.getElementById(`${tabName}TableBody`);
        if (tbody) tbody.innerHTML = '';
    }
}
function getDoctorStatus(timeSlot) {

    if (!timeSlot) return 'Offline';

    const now = new Date();

    const currentMinutes =
        now.getHours() * 60 +
        now.getMinutes();

    const [start, end] =
        timeSlot.split('-');

    function convertToMinutes(time) {

        const [hourMinute, modifier] =
            time.trim().split(' ');

        let [hours, minutes] =
            hourMinute.split(':').map(Number);

        if (
            modifier === 'PM' &&
            hours !== 12
        ) {
            hours += 12;
        }

        if (
            modifier === 'AM' &&
            hours === 12
        ) {
            hours = 0;
        }

        return hours * 60 + minutes;
    }

    const startMinutes =
        convertToMinutes(start);

    const endMinutes =
        convertToMinutes(end);

    return (
        currentMinutes >= startMinutes &&
        currentMinutes <= endMinutes
    )
        ? 'Available'
        : 'Offline';
}

function formatDoctorPayoutSummary(item) {
    const payment = item.paymentDetails || item;
    const mode = String(payment.paymentMode || payment.paymentMethod || '').toLowerCase();
    if (payment.upiId || mode.includes('upi')) {
        return payment.upiId ? ('UPI: ' + payment.upiId) : 'UPI not set';
    }
    if (payment.accountNumber || mode.includes('bank')) {
        const masked = String(payment.accountNumber || '').replace(/\d(?=\d{4})/g, '*');
        return [
            payment.bankName || 'Bank',
            payment.accountHolderName || '',
            masked,
            payment.ifscCode || payment.ifsc || ''
        ].filter(Boolean).join(' · ');
    }
    return 'Not provided';
}

function formatDoctorPayoutDetails(item) {
    const payment = item.paymentDetails || item;
    const lines = [];
    if (payment.upiId) lines.push('UPI ID: ' + payment.upiId);
    if (payment.accountHolderName) lines.push('Account holder: ' + payment.accountHolderName);
    if (payment.bankName) lines.push('Bank: ' + payment.bankName);
    if (payment.accountNumber) lines.push('Account number: ' + payment.accountNumber);
    if (payment.ifscCode || payment.ifsc) lines.push('IFSC: ' + (payment.ifscCode || payment.ifsc));
    if (!lines.length) lines.push('No payout details on file.');
    return lines.join('\n');
}

function viewDoctorPayout(item) {
    alert(formatDoctorPayoutDetails(item));
}

// Update table content
function updateTable(tabName, data) {
    if (!Array.isArray(data)) {
        console.error('Data is not an array:', data);
        return;
    }

    const tbody = document.getElementById(`${tabName}TableBody`);
    if (!tbody) {
        console.error(`Table body not found for ${tabName}`);
        return;
    }

    tbody.innerHTML = '';
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        
        // Create a safe version of the item for JSON stringification
        const safeItem = { ...item };
        if (safeItem._id) {
            safeItem.id = safeItem._id;
            delete safeItem._id;
        }
        
        switch(tabName) {
            case 'doctors': {
                const availStatus = (window.DgDoctorStatus
                    ? DgDoctorStatus.getEffectiveStatus(item).effective
                    : getDoctorStatus(item.availableTime));
                const availClass = String(availStatus || 'offline').toLowerCase();
                tr.innerHTML = `
                    <td>${item.name || ''}</td>
                    <td>${item.specialization || ''}</td>
                    <td>${item.license || ''}</td>
                    <td>${Array.isArray(item.languages) ? item.languages.join(', ') : ''}</td>
                    <td>
                        ${Array.isArray(item.documents) && item.documents.length > 0 ?
                            `<button class="action-btn view-btn" onclick='viewDoctorDocuments(${JSON.stringify(item.documents).replace(/'/g, "&#39;")})' title="View Documents"><i class="fas fa-file-lines" aria-hidden="true"></i> (${item.documents.length})</button>` :
                            '<span class="text-muted">No documents</span>'
                        }
                    </td>
                    <td>${item.availableTime || ''}</td>
                    <td>
                        <small>${formatDoctorPayoutSummary(item)}</small>
                        <button type="button" class="action-btn view-btn" onclick='viewDoctorPayout(${JSON.stringify(safeItem).replace(/'/g, "&#39;")})' title="View payout details">View</button>
                    </td>
                    <td class="cell-status"><span class="status-badge ${(item.Regstatus || '').toLowerCase()}">${item.Regstatus || ''}</span></td>
                    <td class="cell-status">
                        <span class="status-badge ${availClass}">${availStatus}</span>
                        <small class="status-meta">(working: ${item.working || '—'})</small>
                    </td>
                    <td class="cell-actions">
                        <div class="actions-group">
                            <button type="button" class="action-btn edit-btn" onclick='showEditModal("doctors", ${JSON.stringify(safeItem).replace(/'/g, "&#39;")})'>Edit</button>
                            ${item.Regstatus === 'pending' ? `<button type="button" class="action-btn approve-btn" onclick='approveDoctor("${item._id}")'>Verify</button><button type="button" class="action-btn reject-btn" onclick='rejectDoctor("${item._id}")'>Reject</button>` : ''}
                            <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("doctors", "${item._id}")'>Delete</button>
                        </div>
                    </td>
                `;
                break;
            }

            case 'patients':
                tr.innerHTML = `
                    <td>${item.name || item.patientId || ''}</td>
                    <td>${item.email || ''}</td>
                    <td>${item.phone || ''}</td>
                    <td>${Array.isArray(item.reports) ? item.reports.length + ' report(s)' : 'No reports'}</td>
                    <td>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</td>
                    <td class="cell-actions">
                        <div class="actions-group">
                            <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("patients", "${item._id}")'>Delete</button>
                        </div>
                    </td>
                `;
                break;

            case 'prescriptions':
                const status = item.status || 'not-delivered';
                tr.innerHTML = `
                    <td>${item.phone || ''}</td>
                    <td>
                        <button class="action-btn view-btn" onclick='viewPrescriptionItems(${JSON.stringify(item.items || [])})' title="View Items"><i class="fas fa-box" aria-hidden="true"></i> (${Array.isArray(item.items) ? item.items.length : 0})</button>
                    </td>
                    <td>₹${item.total || 0}</td>
                    <td>
                        ${item.paymentProof ? 
                            `<button class="action-btn view-btn" onclick='viewPaymentProof(${JSON.stringify(item.paymentProof)})' title="View Payment Proof"><i class="fas fa-file-lines" aria-hidden="true"></i></button>` : 
                            '<span class="text-muted">No proof</span>'
                        }
                    </td>
                    <td>
                        <button class="status-btn ${status}" onclick='togglePrescriptionStatus("${item._id}", "${status}")'>
                            ${status === 'delivered' ? 'Delivered' : 'Not Delivered'}
                        </button>
                    </td>
                    <td>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</td>
                    <td class="cell-actions">
                        <div class="actions-group">
                            <button type="button" class="action-btn edit-btn" onclick='showEditModal("prescriptions", ${JSON.stringify(safeItem).replace(/'/g, "&#39;")})'>Edit</button>
                            <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("prescriptions", "${item._id}")'>Delete</button>
                        </div>
                    </td>
                `;
                break;
                
            case 'orders':
                tr.innerHTML = `
                    <td>${item.customerName || ''}</td>
                    <td>${item.customerPhone || ''}</td>
                    <td>
                        <button class="action-btn view-btn" onclick='viewOrderItems(${JSON.stringify(item.items || []).replace(/'/g, "&#39;")})' title="View Items"><i class="fas fa-box" aria-hidden="true"></i> (${Array.isArray(item.items) ? item.items.length : 0})</button>
                    </td>
                    <td>₹${item.totalAmount || 0}</td>
                    <td><span class="status-badge ${(item.orderStatus || '').toLowerCase()}">${item.orderStatus || ''}</span></td>
                    <td>
                        ${item.paymentProof ? 
                            `<button class="action-btn view-btn" onclick='viewPaymentProof(${JSON.stringify(item.paymentProof).replace(/'/g, "&#39;")})' title="View Payment Proof"><i class="fas fa-file-lines" aria-hidden="true"></i></button>` : 
                            '<span class="text-muted">No proof</span>'
                        }
                    </td>
                    <td>${item.orderDate ? new Date(item.orderDate).toLocaleDateString() : ''}</td>
                    <td class="cell-actions">
                        <div class="actions-group">
                            <button type="button" class="action-btn edit-btn" onclick='showEditModal("orders", ${JSON.stringify(safeItem).replace(/'/g, "&#39;")})'>Edit</button>
                            <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("orders", "${item._id}")'>Delete</button>
                        </div>
                    </td>
                `;
                break;
        }
        
        tbody.appendChild(tr);
    });
}

// Toggle Prescription Status
async function togglePrescriptionStatus(id, currentStatus) {
    if (!id) {
        showNotification('Invalid prescription ID', 'error');
        return;
    }

    const newStatus = currentStatus === 'delivered' ? 'not-delivered' : 'delivered';
    
    try {
        const response = await DgApi.apiFetch(`/api/admin/prescriptions/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        showNotification('Status updated successfully', 'success');
        loadTabData('prescriptions');
    } catch (error) {
        console.error('Error updating status:', error);
        showNotification(`Failed to update status: ${error.message}`, 'error');
    }
}
async function toggleOrderStatus(id, currentStatus) {
    const newStatus = currentStatus === 'delivered' ? 'not-delivered' : 'delivered';
    try {
      const response = await DgApi.apiFetch(`/api/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: newStatus })
      });
  
      if (!response.ok) throw new Error('Failed to update status');
  
      showNotification('Order status updated', 'success');
      loadTabData('orders');
    } catch (err) {
      console.error(err);
      showNotification('Status update failed', 'error');
    }
  }
  

// Reject doctor registration (one-time, pending only)
async function rejectDoctor(id) {
    if (!id) {
        showNotification('Invalid doctor ID', 'error');
        return;
    }
    if (!confirm('Reject this doctor registration? They must register again to apply.')) {
        return;
    }
    try {
        const response = await DgApi.apiFetch(`/api/admin/doctors/${id}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Regstatus: 'rejected' })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `HTTP error! status: ${response.status}`);
        }
        showNotification('Registration rejected', 'success');
        loadTabData('doctors');
    } catch (error) {
        console.error('Error rejecting doctor:', error);
        showNotification(`Failed to reject doctor: ${error.message}`, 'error');
    }
}

// Verify doctor registration (one-time at signup)
async function approveDoctor(id) {
    if (!id) {
        showNotification('Invalid doctor ID', 'error');
        return;
    }
    
    try {
        const response = await DgApi.apiFetch(`/api/admin/doctors/${id}/approve`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ Regstatus: 'approved' })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        showNotification('Doctor verified successfully', 'success');
        loadTabData('doctors');
    } catch (error) {
        console.error('Error approving doctor:', error);
        showNotification(`Failed to approve doctor: ${error.message}`, 'error');
    }
}

// Show Edit Modal
function showEditModal(type, item) {
    if (!item || !type) {
        showNotification('Invalid item data', 'error');
        return;
    }

    currentItem = item;
    currentAction = type;
    const modalTitle = document.getElementById('modalTitle');
    modalTitle.textContent = `Edit ${type.slice(0, -1)}`;
    
    // Clear previous fields
    modalFields.innerHTML = '';
    
    try {
        // Add hidden input for ID
        modalFields.innerHTML = `
            <input type="hidden" id="itemId" value="${item.id || item._id}">
        `;
    
    // Create form fields based on type
    switch(type) {
        case 'doctors':
                modalFields.innerHTML += `
                <div class="form-group">
                    <label for="name">Name</label>
                        <input type="text" id="name" value="${item.name || ''}" required>
                </div>
                <div class="form-group">
                    <label for="specialization">Specialization</label>
                        <input type="text" id="specialization" value="${item.specialization || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="license">License</label>
                        <input type="text" id="license" value="${item.license || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="languages">Languages (comma-separated)</label>
                        <input type="text" id="languages" value="${Array.isArray(item.languages) ? item.languages.join(', ') : ''}" required>
                </div>
                <div class="form-group">
                        <label for="availableTime">Available Time</label>
                        <input type="text" id="availableTime" value="${item.availableTime || ''}" required>
                </div>
                <div class="form-group">
                    <label>Verification (one-time at registration)</label>
                    <input type="text" id="Regstatus" value="${item.Regstatus || 'pending'}" readonly style="background:#f5f5f5">
                    <small>Pending doctors: use Verify/Reject on the list. After verified, status is locked.</small>
                </div>
                <div class="form-group">
                    <label for="paymentMode">Payout method</label>
                    <select id="paymentMode">
                        <option value="upi" ${(item.paymentDetails && item.paymentDetails.paymentMode === 'upi') || item.upiId ? 'selected' : ''}>UPI</option>
                        <option value="bank" ${(item.paymentDetails && item.paymentDetails.paymentMode === 'bank') || item.accountNumber ? 'selected' : ''}>Bank transfer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="upiId">UPI ID</label>
                    <input type="text" id="upiId" value="${item.upiId || (item.paymentDetails && item.paymentDetails.upiId) || ''}" placeholder="name@bank">
                </div>
                <div class="form-group">
                    <label for="accountHolderName">Account holder name</label>
                    <input type="text" id="accountHolderName" value="${item.accountHolderName || (item.paymentDetails && item.paymentDetails.accountHolderName) || ''}">
                </div>
                <div class="form-group">
                    <label for="bankName">Bank name</label>
                    <input type="text" id="bankName" value="${item.bankName || (item.paymentDetails && item.paymentDetails.bankName) || ''}">
                </div>
                <div class="form-group">
                    <label for="accountNumber">Account number</label>
                    <input type="text" id="accountNumber" value="${item.accountNumber || (item.paymentDetails && item.paymentDetails.accountNumber) || ''}">
                </div>
                <div class="form-group">
                    <label for="ifsc">IFSC code</label>
                    <input type="text" id="ifsc" value="${item.ifscCode || item.ifsc || (item.paymentDetails && item.paymentDetails.ifsc) || ''}">
                </div>
                `;
                break;

            case 'prescriptions':
                modalFields.innerHTML += `
                    <div class="form-group">
                        <label for="phone">Phone</label>
                        <input type="tel" id="phone" value="${item.phone || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="total">Total Amount</label>
                        <input type="number" id="total" value="${item.total || 0}" required>
                    </div>
                <div class="form-group">
                    <label for="status">Status</label>
                    <select id="status">
                            <option value="delivered" ${item.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="not-delivered" ${item.status === 'not-delivered' ? 'selected' : ''}>Not Delivered</option>
                    </select>
                </div>
            `;
            break;

            case 'orders':
                modalFields.innerHTML += `
                    <div class="form-group">
                        <label for="customerName">Customer Name</label>
                        <input type="text" id="customerName" value="${item.customerName || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="customerPhone">Customer Phone</label>
                        <input type="text" id="customerPhone" value="${item.customerPhone || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="customerEmail">Customer Email</label>
                        <input type="email" id="customerEmail" value="${item.customerEmail || ''}">
                    </div>
                    <div class="form-group">
                        <label for="deliveryAddress">Delivery Address</label>
                        <input type="text" id="deliveryAddress" value="${item.deliveryAddress || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="subtotal">Subtotal</label>
                        <input type="number" id="subtotal" value="${item.subtotal || 0}" required>
                    </div>
                    <div class="form-group">
                        <label for="deliveryFee">Delivery Fee</label>
                        <input type="number" id="deliveryFee" value="${item.deliveryFee || 0}" required>
                    </div>
                    <div class="form-group">
                        <label for="totalAmount">Total Amount</label>
                        <input type="number" id="totalAmount" value="${item.totalAmount || 0}" required>
                    </div>
                    <div class="form-group">
                        <label for="paymentMethod">Payment Method</label>
                        <select id="paymentMethod">
                            <option value="UPI" ${item.paymentMethod === 'UPI' ? 'selected' : ''}>UPI</option>
                            <option value="COD" ${item.paymentMethod === 'COD' ? 'selected' : ''}>COD</option>
                            <option value="Card" ${item.paymentMethod === 'Card' ? 'selected' : ''}>Card</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="orderStatus">Order Status</label>
                        <select id="orderStatus">
                            <option value="pending" ${item.orderStatus === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="confirmed" ${item.orderStatus === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                            <option value="processing" ${item.orderStatus === 'processing' ? 'selected' : ''}>Processing</option>
                            <option value="shipped" ${item.orderStatus === 'shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="delivered" ${item.orderStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="cancelled" ${item.orderStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="orderDate">Order Date</label>
                        <input type="datetime-local" id="orderDate" value="${item.orderDate ? new Date(item.orderDate).toISOString().slice(0,16) : ''}">
                    </div>
                    <div class="form-group">
                        <label for="estimatedDelivery">Estimated Delivery</label>
                        <input type="datetime-local" id="estimatedDelivery" value="${item.estimatedDelivery ? new Date(item.estimatedDelivery).toISOString().slice(0,16) : ''}">
                    </div>
                    <div class="form-group">
                        <label for="notes">Notes</label>
                        <textarea id="notes">${item.notes || ''}</textarea>
                    </div>
                `;
                break;
    }
    
    editModal.style.display = 'block';
    } catch (error) {
        console.error('Error showing edit modal:', error);
        showNotification('Failed to show edit form', 'error');
    }
}

// Show Delete Modal
function showDeleteModal(type, id) {
    if (!id || !type) {
        showNotification('Invalid item data', 'error');
        return;
    }

    currentItem = { id };
    currentAction = type;
    deleteModal.style.display = 'block';
}

// Handle delete confirmation
async function confirmDelete() {
    try {
        if (!currentItem || !currentItem.id || !currentAction) {
            throw new Error('Missing item data');
        }

        let endpoint;
        // Determine the correct endpoint based on the action type
        switch(currentAction) {
            case 'doctors':
                endpoint = `/api/admin/doctors/${currentItem.id}`;
                break;
            case 'patients':
                endpoint = `/api/admin/patients/${currentItem.id}`;
                break;
            case 'prescriptions':
                endpoint = `/api/admin/prescriptions/${currentItem.id}`;
                break;
            case 'payments':
                endpoint = `/api/admin/payments/${currentItem.id}`;
                break;
            case 'orders':
                endpoint = `/api/orders/${currentItem.id}`;
                break;
            default:
                throw new Error(`Unknown action type: ${currentAction}`);
        }

        const response = await DgApi.apiFetch(endpoint, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        showNotification('Deleted successfully', 'success');
        deleteModal.style.display = 'none';
        loadTabData(currentAction);
    } catch (error) {
        console.error('Error deleting item:', error);
        showNotification(`Delete failed: ${error.message}`, 'error');
    }
}

// Close modals and setup event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Setup delete modal buttons
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    cancelDeleteBtn.addEventListener('click', () => {
        deleteModal.style.display = 'none';
    });

    const settlementModal = document.getElementById('settlementModal');
    const settlementForm = document.getElementById('settlementForm');
    const settlementCommissionPercent = document.getElementById('settlementCommissionPercent');
    if (settlementCommissionPercent) {
        settlementCommissionPercent.addEventListener('input', recalcSettlementPreview);
    }
    if (settlementForm) {
        settlementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paymentId = document.getElementById('settlementPaymentId')?.value;
            const commissionPercent = Number(document.getElementById('settlementCommissionPercent')?.value);
            if (!paymentId) {
                showNotification('Missing payment ID', 'error');
                return;
            }
            if (Number.isNaN(commissionPercent)) {
                showNotification('Enter a valid commission percentage', 'error');
                return;
            }
            try {
                const response = await DgApi.apiFetch('/api/admin/settlements/' + paymentId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commissionPercent,
                        settlementStatus: 'settled',
                        settlementReference: document.getElementById('settlementReference')?.value || '',
                        settlementNote: document.getElementById('settlementNote')?.value || '',
                        settledBy: document.getElementById('adminName')?.textContent || 'admin'
                    })
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP error! status: ${response.status}`);
                }
                showNotification('Settlement saved successfully', 'success');
                if (settlementModal) settlementModal.style.display = 'none';
                loadSettlementsWithFiltering();
            } catch (error) {
                console.error('Settlement save failed:', error);
                showNotification(`Settlement failed: ${error.message}`, 'error');
            }
        });
    }

    // Setup modal close buttons
document.querySelectorAll('.close, .cancel-btn').forEach(element => {
    element.addEventListener('click', () => {
        editModal.style.display = 'none';
        deleteModal.style.display = 'none';
        if (settlementModal) settlementModal.style.display = 'none';
    });
});

// Handle form submission
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const formData = {};
        const inputs = modalFields.querySelectorAll('input, select, textarea');
        const itemId = document.getElementById('itemId')?.value;
        if (!itemId || !currentAction) {
            throw new Error('Missing item data');
        }
        if (currentAction === 'orders') {
            // Only collect fields relevant to Order.js model
            inputs.forEach(input => {
                if (input.id === 'totalAmount' || input.id === 'subtotal' || input.id === 'deliveryFee') {
                    formData[input.id] = parseFloat(input.value) || 0;
                } else if (input.id === 'orderDate' || input.id === 'estimatedDelivery') {
                    formData[input.id] = input.value ? new Date(input.value).toISOString() : null;
                } else {
                    formData[input.id] = input.value;
                }
            });
            const response = await DgApi.apiFetch(`/api/admin/orders/${itemId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderStatus: formData.orderStatus,
                    paymentStatus: formData.paymentStatus
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            showNotification('Updated successfully', 'success');
            editModal.style.display = 'none';
            loadTabData(currentAction);
            return;
        }
        // Default for other types
        inputs.forEach(input => {
            formData[input.id] = input.value;
        });
        const response = await DgApi.apiFetch(`/api/admin/${currentAction}/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        showNotification('Updated successfully', 'success');
        editModal.style.display = 'none';
        loadTabData(currentAction);
    } catch (error) {
        console.error('Error updating item:', error);
        showNotification(`Update failed: ${error.message}`, 'error');
    }
});
});

// Payment Filtering Functions
let allPayments = []; // Store all payments for filtering

async function loadPaymentsWithFiltering() {
    try {
        const response = await DgApi.apiFetch('/api/admin/payments');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        allPayments = data; // Store all payments
        updatePaymentsTable(data);
    } catch (error) {
        console.error('Error loading payments:', error);
        showNotification(`Failed to load payments: ${error.message}`, 'error');
    }
}

function updatePaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) {
        console.error('Payments table body not found');
        return;
    }

    tbody.innerHTML = '';
    
    payments.forEach(item => {
        const tr = document.createElement('tr');
        
        // Create a safe version of the item for JSON stringification
        const safeItem = { ...item };
        if (safeItem._id) {
            safeItem.id = safeItem._id;
            delete safeItem._id;
        }
        
        tr.innerHTML = `
            <td>${item.name || ''}</td>
            <td>${item.phone || ''}</td>
            <td>${item.address || ''}</td>
            <td>${item.selectedDoctorName || ''}</td>
            <td>₹${item.selectedDoctorFee || item.amount || ''}</td>
            <td>${item.upiId || ''}</td>
            <td>${item.roomName || ''}</td>
            <td>
                ${item.paymentProofPath ? 
                    `<button class="action-btn view-btn" onclick='viewPaymentProof(${JSON.stringify(item.paymentProofPath)})' title="View Payment Proof"><i class="fas fa-file-lines" aria-hidden="true"></i></button>` : 
                    '<span class="text-muted">No proof</span>'
                }
            </td>
            <td>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</td>
            <td class="cell-actions">
                <div class="actions-group">
                    <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("payments", "${item._id}")'>Delete</button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function applyPaymentFilters() {
    const roomNameFilter = document.getElementById('roomNameFilter').value.toLowerCase();
    const startDateValue = document.getElementById('startDateFilter').value;
    const endDateValue = document.getElementById('endDateFilter').value;
    
    let filteredPayments = allPayments;
    
    // Filter by room name/ID
    if (roomNameFilter) {
        filteredPayments = filteredPayments.filter(payment => 
            (payment.roomName && payment.roomName.toLowerCase().includes(roomNameFilter))
        );
    }
    
    // Filter by date range
    if (startDateValue || endDateValue) {
        let startDate = startDateValue ? new Date(startDateValue) : null;
        let endDate = endDateValue ? new Date(endDateValue) : null;

        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(23, 59, 59, 999);

        filteredPayments = filteredPayments.filter(payment => {
            if (!payment.createdAt) return false;
            const paymentDate = new Date(payment.createdAt);
            if (startDate && paymentDate < startDate) return false;
            if (endDate && paymentDate > endDate) return false;
            return true;
        });
    }
    
    updatePaymentsTable(filteredPayments);
    
    // Show filter summary
    const totalPayments = allPayments.length;
    const filteredCount = filteredPayments.length;
    showNotification(`Showing ${filteredCount} of ${totalPayments} payments`, 'info');
}

function clearPaymentFilters() {
    document.getElementById('roomNameFilter').value = '';
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';
    updatePaymentsTable(allPayments);
    showNotification('Filters cleared', 'info');
}

// View Payment Proof
function viewPaymentProof(filename) {
    if (!filename) {
        showNotification('No payment proof available', 'error');
        return;
    }
    
    // Extract just the filename from the full path
    let cleanFilename = filename;
    if (filename.includes('\\')) {
        // Windows path - extract filename from the end
        cleanFilename = filename.split('\\').pop();
    } else if (filename.includes('/')) {
        // Unix path - extract filename from the end
        cleanFilename = filename.split('/').pop();
    }
    
    // Open payment proof in new tab
    const imageUrl = `/uploads/${cleanFilename}`;
    window.open(imageUrl, '_blank');
}

// View Doctor Documents
function viewDoctorDocuments(documents) {
    if (!documents || documents.length === 0) {
        showNotification('No documents available for this doctor', 'info');
        return;
    }
    
    // Create modal content for documents
    let documentsHtml = '<div class="items-modal documents-modal">';
    documentsHtml += '<h3>Doctor Documents</h3>';
    documentsHtml += '<div class="items-grid">';
    
    documents.forEach((documentPath, index) => {
        // Extract filename from path
        let filename = documentPath;
        if (documentPath.includes('\\')) {
            filename = documentPath.split('\\').pop();
        } else if (documentPath.includes('/')) {
            filename = documentPath.split('/').pop();
        }
        
        // Extract clean filename for URL
        let cleanFilename = filename;
        if (filename.includes('\\')) {
            cleanFilename = filename.split('\\').pop();
        } else if (filename.includes('/')) {
            cleanFilename = filename.split('/').pop();
        }
        
        const fileType = getFileType(filename);
        const fileIcon = getFileIcon(fileType);
        
        documentsHtml += `
            <div class="item-card">
                <h4>
                    <span class="document-icon">${fileIcon}</span>
                    Document ${index + 1}
                </h4>
                <div class="file-info">
                    <p><strong>Filename:</strong> ${filename}</p>
                    <p><strong>Type:</strong> ${fileType}</p>
                </div>
                <button class="open-btn" onclick='openDocument("${cleanFilename}")' title="Open Document">
                    <i class="fas fa-file-lines dg-inline-icon" aria-hidden="true"></i> Open Document
                </button>
            </div>
        `;
    });
    
    documentsHtml += '</div></div>';
    
    // Show documents in modal
    showItemsModal(documentsHtml);
}

// Helper function to get file type from filename
function getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const documentTypes = ['pdf', 'doc', 'docx', 'txt'];
    
    if (imageTypes.includes(extension)) {
        return 'Image';
    } else if (documentTypes.includes(extension)) {
        return 'Document';
    } else {
        return 'File';
    }
}

// Helper function to get appropriate icon for file type
function getFileIcon(fileType) {
    switch(fileType.toLowerCase()) {
        case 'image':
            return '<i class="fas fa-image" aria-hidden="true"></i>';
        case 'document':
            return '<i class="fas fa-file-lines" aria-hidden="true"></i>';
        default:
            return '<i class="fas fa-folder" aria-hidden="true"></i>';
    }
}

// Open document in new tab
function openDocument(filename) {
    if (!filename) {
        showNotification('Invalid filename', 'error');
        return;
    }
    
    const documentUrl = `/uploads/${filename}`;
    window.open(documentUrl, '_blank');
}

// View Prescription Items
function viewPrescriptionItems(items) {
    if (!items || items.length === 0) {
        showNotification('No items found in this prescription', 'info');
        return;
    }
    
    // Create modal content for items
    let itemsHtml = '<div class="items-modal">';
    itemsHtml += '<h3>Prescription Items</h3>';
    itemsHtml += '<div class="items-grid">';
    
    items.forEach((item, index) => {
        itemsHtml += `
            <div class="item-card">
                <h4>${item.name || 'Unknown Item'}</h4>
                <p><strong>Store ID:</strong> ${item.storeId || 'N/A'}</p>
                <p><strong>Weight:</strong> ${item.selectedWeight?.value || 'N/A'} ${item.selectedWeight?.unit || ''}</p>
                <p><strong>Price per unit:</strong> ₹${item.pricePerUnit || 0}</p>
                <p><strong>Quantity:</strong> ${item.quantity || 0}</p>
                <p><strong>Total Price:</strong> ₹${item.totalPrice || 0}</p>
            </div>
        `;
    });
    
    itemsHtml += '</div></div>';
    
    // Show items in modal
    showItemsModal(itemsHtml);
}

// Show Items Modal
function showItemsModal(content) {
    // Create modal if it doesn't exist
    let itemsModal = document.getElementById('itemsModal');
    if (!itemsModal) {
        itemsModal = document.createElement('div');
        itemsModal.id = 'itemsModal';
        itemsModal.className = 'modal';
        itemsModal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="closeItemsModal()">&times;</span>
                <div id="itemsModalContent"></div>
            </div>
        `;
        document.body.appendChild(itemsModal);
    }
    
    // Update content and show modal
    document.getElementById('itemsModalContent').innerHTML = content;
    itemsModal.style.display = 'block';
}

// Close Items Modal
function closeItemsModal() {
    const itemsModal = document.getElementById('itemsModal');
    if (itemsModal) {
        itemsModal.style.display = 'none';
    }
}

// Logout functionality
async function logout() {
    try {
        const response = await fetch('/api/admin/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        showNotification(`Logout failed: ${error.message}`, 'error');
    }
}

// Order Filtering Functions
let allOrders = []; // Store all orders for filtering

async function loadOrdersWithFiltering() {
    try {
        const response = await DgApi.apiFetch('/api/orders');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        allOrders = data; // Store all orders
        updateOrdersTable(data);
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification(`Failed to load orders: ${error.message}`, 'error');
    }
}

function updateOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) {
        console.error('Orders table body not found');
        return;
    }

    tbody.innerHTML = '';
    
    orders.forEach(item => {
        const tr = document.createElement('tr');
        
        // Create a safe version of the item for JSON stringification
        const safeItem = { ...item };
        if (safeItem._id) {
            safeItem.id = safeItem._id;
            delete safeItem._id;
        }
        
        tr.innerHTML = `
            <td>${item.customerName || ''}</td>
            <td>${item.customerPhone || ''}</td>
            <td>
                <button class="action-btn view-btn" onclick='viewOrderItems(${JSON.stringify(item.items || []).replace(/'/g, "&#39;")})' title="View Items"><i class="fas fa-box" aria-hidden="true"></i> (${Array.isArray(item.items) ? item.items.length : 0})</button>
            </td>
            <td>₹${item.totalAmount || 0}</td>
            <td><span class="status-badge ${(item.orderStatus || '').toLowerCase()}">${item.orderStatus || ''}</span></td>
            <td>
                ${item.paymentProof ? 
                    `<button class="action-btn view-btn" onclick='viewPaymentProof(${JSON.stringify(item.paymentProof).replace(/'/g, "&#39;")})' title="View Payment Proof"><i class="fas fa-file-lines" aria-hidden="true"></i></button>` : 
                    '<span class="text-muted">No proof</span>'
                }
            </td>
            <td>${item.orderDate ? new Date(item.orderDate).toLocaleDateString() : ''}</td>
            <td class="cell-actions">
                <div class="actions-group">
                    <button type="button" class="action-btn edit-btn" onclick='showEditModal("orders", ${JSON.stringify(safeItem).replace(/'/g, "&#39;")})'>Edit</button>
                    <button type="button" class="action-btn delete-btn" onclick='showDeleteModal("orders", "${item._id}")'>Delete</button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function applyOrderFilters() {
    const orderStatusFilter = document.getElementById('orderStatusFilter').value;
    let filteredOrders = allOrders;
    // Filter by order status
    if (orderStatusFilter) {
        filteredOrders = filteredOrders.filter(order => 
            order.orderStatus === orderStatusFilter
        );
    }
    updateOrdersTable(filteredOrders);
    // Show filter summary
    const totalOrders = allOrders.length;
    const filteredCount = filteredOrders.length;
    showNotification(`Showing ${filteredCount} of ${totalOrders} orders`, 'info');
}

function clearOrderFilters() {
    document.getElementById('orderStatusFilter').value = '';
    updateOrdersTable(allOrders);
    showNotification('Filters cleared', 'info');
}

// View Order Items
function viewOrderItems(items) {
    if (!items || items.length === 0) {
        showNotification('No items found in this order', 'info');
        return;
    }
    
    // Create modal content for items
    let itemsHtml = '<div class="items-modal">';
    itemsHtml += '<h3>Order Items</h3>';
    itemsHtml += '<div class="items-grid">';
    
    items.forEach((item, index) => {
        itemsHtml += `
            <div class="item-card">
                <h4>${item.name || 'Unknown Item'}</h4>
                <p><strong>Store:</strong> ${item.storeName || 'N/A'}</p>
                <p><strong>Weight:</strong> ${item.selectedWeight?.value || 'N/A'} ${item.selectedWeight?.unit || ''}</p>
                <p><strong>Price per unit:</strong> ₹${item.pricePerUnit || 0}</p>
                <p><strong>Quantity:</strong> ${item.quantity || 0}</p>
                <p><strong>Total Price:</strong> ₹${item.totalPrice || 0}</p>
            </div>
        `;
    });
    
    itemsHtml += '</div></div>';
    
    // Show items in modal
    showItemsModal(itemsHtml);
}

let allSettlements = [];

async function loadSettlementsWithFiltering() {
    try {
        const response = await DgApi.apiFetch('/api/admin/settlements');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allSettlements = await response.json();
        updateSettlementsTable(allSettlements);
    } catch (error) {
        console.error('Error loading settlements:', error);
        showNotification(`Failed to load settlements: ${error.message}`, 'error');
    }
}

function updateSettlementsTable(rows) {
    const tbody = document.getElementById('settlementsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    rows.forEach((item) => {
        const tr = document.createElement('tr');
        const status = String(item.settlementStatus || 'pending').toLowerCase();
        const safeItem = JSON.stringify(item).replace(/'/g, '&#39;');
        tr.innerHTML = `
            <td>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</td>
            <td>${item.patientName || ''}<br><small>${item.patientPhone || ''}</small></td>
            <td>${item.doctorName || ''}</td>
            <td>₹${item.grossAmount || 0}</td>
            <td>${item.commissionPercent != null ? item.commissionPercent + '%' : '—'}</td>
            <td>${item.commissionAmount != null ? '₹' + item.commissionAmount : '—'}</td>
            <td>${item.doctorNetAmount != null ? '₹' + item.doctorNetAmount : '—'}</td>
            <td><small>${item.doctorPayoutSummary || 'Not provided'}</small></td>
            <td><span class="status-badge ${status}">${status}</span></td>
            <td class="cell-actions">
                <div class="actions-group">
                    <button type="button" class="action-btn edit-btn" onclick='openSettlementModal(${safeItem})'>${status === 'settled' ? 'Update' : 'Settle'}</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function applySettlementFilters() {
    const statusFilter = (document.getElementById('settlementStatusFilter')?.value || '').toLowerCase();
    const doctorFilter = (document.getElementById('settlementDoctorFilter')?.value || '').toLowerCase().trim();
    let filtered = allSettlements;
    if (statusFilter) {
        filtered = filtered.filter((row) => String(row.settlementStatus || '').toLowerCase() === statusFilter);
    }
    if (doctorFilter) {
        filtered = filtered.filter((row) => String(row.doctorName || '').toLowerCase().includes(doctorFilter));
    }
    updateSettlementsTable(filtered);
    showNotification(`Showing ${filtered.length} of ${allSettlements.length} settlements`, 'info');
}

function clearSettlementFilters() {
    const statusEl = document.getElementById('settlementStatusFilter');
    const doctorEl = document.getElementById('settlementDoctorFilter');
    if (statusEl) statusEl.value = '';
    if (doctorEl) doctorEl.value = '';
    updateSettlementsTable(allSettlements);
    showNotification('Settlement filters cleared', 'info');
}

function formatSettlementPayoutDetails(item) {
    const payout = item.doctorPayout || {};
    const lines = [];
    if (payout.upiId) lines.push('UPI ID: ' + payout.upiId);
    if (payout.accountHolderName) lines.push('Account holder: ' + payout.accountHolderName);
    if (payout.bankName) lines.push('Bank: ' + payout.bankName);
    if (payout.accountNumber) lines.push('Account number: ' + payout.accountNumber);
    if (payout.ifsc) lines.push('IFSC: ' + payout.ifsc);
    if (!lines.length) lines.push('Doctor has not added payout details yet.');
    return lines.join('\n');
}

function recalcSettlementPreview() {
    const gross = Number(document.getElementById('settlementGross')?.dataset.value || 0);
    const pct = Number(document.getElementById('settlementCommissionPercent')?.value || 0);
    const commission = Math.round(gross * pct) / 100;
    const roundedCommission = Math.round(commission * 100) / 100;
    const net = Math.round((gross - roundedCommission) * 100) / 100;
    const commissionEl = document.getElementById('settlementCommissionAmount');
    const netEl = document.getElementById('settlementDoctorNet');
    if (commissionEl) commissionEl.value = '₹' + roundedCommission;
    if (netEl) netEl.value = '₹' + net;
}

function openSettlementModal(item) {
    const modal = document.getElementById('settlementModal');
    if (!modal || !item) return;
    document.getElementById('settlementPaymentId').value = item.paymentId || '';
    document.getElementById('settlementPatient').value = [item.patientName, item.patientPhone].filter(Boolean).join(' · ');
    document.getElementById('settlementDoctor').value = item.doctorName || '';
    const grossEl = document.getElementById('settlementGross');
    if (grossEl) {
        grossEl.value = '₹' + (item.grossAmount || 0);
        grossEl.dataset.value = String(item.grossAmount || 0);
    }
    document.getElementById('settlementCommissionPercent').value = item.commissionPercent != null ? item.commissionPercent : '';
    document.getElementById('settlementReference').value = item.settlementReference || '';
    document.getElementById('settlementNote').value = item.settlementNote || '';
    document.getElementById('settlementPayoutDetails').value = formatSettlementPayoutDetails(item);
    recalcSettlementPreview();
    modal.style.display = 'block';
}

window.loadOrdersWithFiltering = loadOrdersWithFiltering;
window.clearOrderFilters = clearOrderFilters;window.applyOrderFilters = applyOrderFilters;
window.loadSettlementsWithFiltering = loadSettlementsWithFiltering;
window.applySettlementFilters = applySettlementFilters;
window.clearSettlementFilters = clearSettlementFilters;
window.openSettlementModal = openSettlementModal;
window.viewDoctorPayout = viewDoctorPayout;
// Expose functions globally
window.viewDoctorDocuments = viewDoctorDocuments;
window.loadPaymentsWithFiltering = loadPaymentsWithFiltering;
window.viewPaymentProof = viewPaymentProof;
window.viewOrderItems = viewOrderItems;
window.openDocument = openDocument;
window.closeItemsModal = closeItemsModal;
window.viewPrescriptionItems = viewPrescriptionItems;
window.applyPaymentFilters = applyPaymentFilters;
window.clearPaymentFilters = clearPaymentFilters;
window.loadOrdersWithFiltering = loadOrdersWithFiltering;
window.clearOrderFilters = clearOrderFilters;
window.applyOrderFilters = applyOrderFilters;
window.approveDoctor = approveDoctor;
window.rejectDoctor = rejectDoctor;
window.showEditModal = showEditModal;
window.showDeleteModal = showDeleteModal;

function showLogin() {
    adminLoginContainer.style.display = 'block';
    adminDashboardContainer.style.display = 'none';
}

function showDashboard() {
    adminLoginContainer.style.display = 'none';
    adminDashboardContainer.style.display = 'block';
    const activeTab = document.querySelector('.tab-btn.active');
    const tabName = activeTab ? activeTab.dataset.tab : 'doctors';
    loadTabData(tabName);
    refreshFirebaseStatus();
}

function isAdminLoggedIn() {
    return !!(window.DgApi && DgApi.getAdminToken());
}

function setAdminLoggedIn(val) {
    if (window.DgApi) {
        if (!val) DgApi.setAdminToken('');
    }
}

window.onAdminSessionExpired = function () {
    setAdminLoggedIn(false);
    showLogin();
    if (adminLoginError) {
        adminLoginError.textContent = 'Session expired. Please log in again.';
        adminLoginError.style.display = 'block';
    }
};

async function refreshFirebaseStatus() {
    const el = document.getElementById('adminFirebaseStatus');
    if (!el) return;
    try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = await res.json();
        if (data.db === 'connected' && data.firestore) {
            el.textContent = 'Firebase connected';
            el.className = 'admin-firebase-status connected';
            el.title = 'Provider: ' + (data.provider || 'firebase');
            return;
        }

        el.className = 'admin-firebase-status disconnected';
        if (data.credentials === 'missing' || data.db === 'no_credentials') {
            el.textContent = 'Firebase: credentials missing';
            el.title =
                'Set FIREBASE_SERVICE_ACCOUNT_JSON in Render (full service account JSON on one line). ' +
                'Remove GOOGLE_APPLICATION_CREDENTIALS, save, then Manual Deploy.';
            return;
        }
        if (data.db === 'error' && data.error) {
            el.textContent = 'Firebase: read error';
            el.title = data.error;
            return;
        }
        el.textContent = 'Firebase disconnected';
        el.title =
            'Check /api/health on the server. db=' +
            (data.db || 'unknown') +
            ', credentials=' +
            (data.credentials || 'unknown');
    } catch (e) {
        el.textContent = 'Server unreachable';
        el.className = 'admin-firebase-status disconnected';
        el.title = e.message || 'Could not reach /api/health';
    }
}

function setupAdminRealtime() {
    if (!window.DgRealtime) return;
    DgRealtime.onPresenceUpdate(function () {
        const active = document.querySelector('.tab-btn.active');
        if (active && active.dataset.tab === 'doctors') {
            loadTabData('doctors');
        }
    });
}

if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('adminUsername').value.trim();
        const password = document.getElementById('adminPassword').value;
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                DgApi.setAdminToken(data.token);
                adminLoginError.style.display = 'none';
                const successMsg = document.getElementById('adminLoginSuccess');
                if (successMsg) successMsg.style.display = 'block';
                setTimeout(() => {
                    if (successMsg) successMsg.style.display = 'none';
                    showDashboard();
                }, 800);
                adminLoginForm.reset();
            } else {
                adminLoginError.textContent = data.message || 'Invalid username or password.';
                adminLoginError.style.display = 'block';
            }
        } catch (err) {
            adminLoginError.textContent = 'Could not connect to server.';
            adminLoginError.style.display = 'block';
        }
    });
}

window.logout = async function () {
    try {
        await DgApi.apiFetch('/api/admin/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    setAdminLoggedIn(false);
    showLogin();
};

async function initAdminPage() {
    if (window.DgApi) {
        await DgApi.bootstrapApp({ skipOnLocalhost: false });
    }
    if (isAdminLoggedIn()) {
        showDashboard();
    } else {
        showLogin();
    }
    refreshFirebaseStatus();
    setupAdminRealtime();
}

document.addEventListener('DOMContentLoaded', initAdminPage);