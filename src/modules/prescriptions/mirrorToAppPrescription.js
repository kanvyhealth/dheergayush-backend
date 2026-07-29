/**
 * Mirror website prescribedCarts → Flutter `prescriptions/{appointmentId}` schema.
 */
const { Prescription, Payment, ConsultationRequest } = require('../../core/data');
const { parseAppointmentIdFromRoom, normalizeVideoRoomId } = (() => {
  // Lazy helpers from application are injected when available; local fallbacks kept here.
  return {
    parseAppointmentIdFromRoom(roomId) {
      const room = String(roomId || '').trim();
      try {
        const decoded = decodeURIComponent(room);
        const match = decoded.match(/^room_(.+)$/i);
        return match ? String(match[1]).trim() : '';
      } catch (_) {
        const match = room.match(/^room_(.+)$/i);
        return match ? String(match[1]).trim() : '';
      }
    },
    normalizeVideoRoomId(roomId) {
      try {
        return decodeURIComponent(String(roomId || '').trim());
      } catch (_) {
        return String(roomId || '').trim();
      }
    }
  };
})();

function mapCartItemsToAppMedicines(cartItems = []) {
  return (Array.isArray(cartItems) ? cartItems : []).map((item, index) => {
    const productId = String(
      item.medicineId || item.storeProductId || item.productId || item.id || `item_${index}`
    ).trim();
    const quantity = Number(item.quantity) || 1;
    const price = Number(item.pricePerUnit || item.price || 0) || 0;
    return {
      id: productId,
      productId,
      storeProductId: productId,
      name: item.name || 'Medicine',
      genericName: item.storeName || item.company || 'Generic',
      form: item.category || (item.selectedWeight
        ? `${item.selectedWeight.value || ''}${item.selectedWeight.unit || ''}`.trim()
        : 'N/A'),
      isPrescription: true,
      dosage: item.dosage || '',
      frequency: item.frequency || '',
      duration: item.duration || '',
      instructions: item.instructions || item.description || '',
      quantity,
      price,
      company: item.storeName || item.company || '',
      category: item.category || '',
      imageUrl: item.imageUrl || '',
      collection: item.collection || 'medicines',
      productType: item.productType || 'medicine',
      productTypeName: item.productTypeName || item.category || 'Medicine',
      source: item.source || 'store',
      isStoreListed: item.isStoreListed !== false,
      orderable: item.orderable !== false,
      selectedWeight: item.selectedWeight || null,
      totalPrice: item.totalPrice || price * quantity
    };
  });
}

async function resolveAppointmentContext(roomId) {
  const normalizedRoomId = normalizeVideoRoomId(roomId);
  let appointmentId = parseAppointmentIdFromRoom(normalizedRoomId);

  const payment = await Payment.findOne({ roomName: normalizedRoomId }).sort({ createdAt: -1 });
  if (!appointmentId) {
    appointmentId = String(payment?.appointmentId || payment?.consultationId || '').trim();
  }

  let appointment = appointmentId
    ? await ConsultationRequest.findById(appointmentId)
    : null;

  if (!appointment) {
    appointment = await ConsultationRequest.findOne({
      $or: [{ videoRoomId: normalizedRoomId }, { roomId: normalizedRoomId }]
    }).sort({ createdAt: -1 });
    if (appointment && !appointmentId) {
      appointmentId = String(appointment._id || appointment.id || '').trim();
    }
  }

  if (!appointmentId) {
    return null;
  }

  const patientId = String(
    appointment?.patientId
    || appointment?.userId
    || appointment?.uid
    || payment?.patientId
    || payment?.uid
    || ''
  ).trim();

  const doctorId = String(
    appointment?.doctorId
    || payment?.doctorId
    || ''
  ).trim();

  const patientName = String(
    appointment?.patientName
    || appointment?.userName
    || appointment?.name
    || payment?.patientName
    || payment?.name
    || 'Patient'
  ).trim();

  const doctorName = String(
    appointment?.doctorName
    || appointment?.selectedDoctorName
    || payment?.selectedDoctorName
    || payment?.doctorName
    || 'Doctor'
  ).trim();

  return {
    appointmentId,
    normalizedRoomId,
    patientId,
    doctorId,
    patientName,
    doctorName,
    appointment,
    payment
  };
}

/**
 * Upsert Flutter-compatible prescription document after website prescribe-cart.
 * Logs failures; does not throw to the caller by default (caller may await and catch).
 */
async function mirrorPrescribedCartToAppPrescription({
  roomId,
  cartItems,
  prescribedAt,
  doctorName: sessionDoctorName
} = {}) {
  const ctx = await resolveAppointmentContext(roomId);
  if (!ctx?.appointmentId) {
    console.warn(
      'mirrorPrescribedCartToAppPrescription: could not resolve appointmentId for room',
      roomId
    );
    return null;
  }

  const medicines = mapCartItemsToAppMedicines(cartItems);
  const now = prescribedAt instanceof Date ? prescribedAt : new Date(prescribedAt || Date.now());
  const payload = {
    appointmentId: ctx.appointmentId,
    doctorId: ctx.doctorId,
    patientId: ctx.patientId,
    user_id: ctx.patientId,
    doctorName: sessionDoctorName || ctx.doctorName || 'Doctor',
    patientName: ctx.patientName || 'Patient',
    medicines,
    roomId: ctx.normalizedRoomId,
    videoRoomId: ctx.normalizedRoomId,
    sharedWithPatient: true,
    sharedWithCustomer: true,
    shareStatus: 'shared',
    sharedAt: now,
    prescribedAt: now,
    updatedAt: now,
    isActive: true,
    source: 'website_prescribe_cart'
  };

  const existing = await Prescription.findById(ctx.appointmentId);
  let saved;
  if (existing) {
    saved = await Prescription.findByIdAndUpdate(
      ctx.appointmentId,
      { $set: payload },
      { new: true }
    );
  } else {
    saved = await Prescription.create({
      _id: ctx.appointmentId,
      ...payload,
      createdAt: now
    });
  }

  console.log(
    'mirrorPrescribedCartToAppPrescription: mirrored',
    ctx.appointmentId,
    'items=',
    medicines.length
  );
  return saved;
}

module.exports = {
  mapCartItemsToAppMedicines,
  resolveAppointmentContext,
  mirrorPrescribedCartToAppPrescription
};
