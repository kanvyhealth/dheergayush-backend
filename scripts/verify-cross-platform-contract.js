const assert = require('assert');

const { MOBILE_COLLECTIONS } = require('../src/core/mobileSchema');
const {
  scheduledCallId,
  videoRoomIdForAppointment,
  buildWebPaidAppointmentFields,
  buildWebPaidPaymentFields,
  buildActiveCallRecord,
  buildAppAcceptedFields,
  buildAppInCallFields,
  buildAppCompletedFields,
  buildAppTerminalFields,
  canonicalVideoChannelForAppointment,
  canonicalizeAgoraChannelAlias,
  isValidAgoraChannelName,
  agoraUidForUserId
} = require('../src/modules/consultations/appAppointmentSync');
const {
  buildConsultationStatusFields,
  normalizeConsultationStatus,
  patientCanJoinVideo
} = require('../src/modules/consultations/consultationWorkflow');
const { buildPaymentLifecyclePatch } = require('../src/modules/consultations/consultationLifecycleSync');
  const { buildFirestoreOrderPayload } = require('../src/modules/store/webOrderSync');
  const {
    isPrescriptionLinkedOrder,
    evaluatePrescriptionOrderAuth,
    bindOrderIdentity
  } = require('../src/modules/store/prescriptionOrderAuth');

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

function assertFields(obj, fields, label) {
  for (const field of fields) {
    assert(hasOwn(obj, field), `${label} missing ${field}`);
  }
}

function run() {
  assert(MOBILE_COLLECTIONS.includes('users'), 'users collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('doctors'), 'doctors collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('appointments'), 'appointments collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('payments'), 'payments collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('active_calls'), 'active_calls collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('orders'), 'orders collection must stay app-compatible');
  assert(MOBILE_COLLECTIONS.includes('medicine_orders'), 'medicine_orders collection must stay app-compatible');

  const appointmentId = 'appt_contract_001';
  const patientId = 'firebase_patient_uid';
  const doctorId = 'firebase_doctor_uid';
  const roomId = videoRoomIdForAppointment(appointmentId);

  assert.strictEqual(scheduledCallId(appointmentId), 'consultation_appt_contract_001');
  assert.strictEqual(roomId, 'room_appt_contract_001');

  const appointment = buildWebPaidAppointmentFields({
    appointmentId,
    patientId,
    patientName: 'Patient',
    patientPhone: '7842736777',
    doctorId,
    doctorName: 'Doctor',
    amount: 500,
    paymentId: 'pay_contract_001',
    doctorAvailableTime: '10:00 AM'
  });

  assertFields(
    appointment,
    [
      'appointmentId',
      'consultationId',
      'patientId',
      'userId',
      'doctorId',
      'doctorName',
      'roomId',
      'videoRoomId',
      'paymentStatus',
      'appointmentStatus',
      'consultationStatus',
      'consultationQueueStatus',
      'ringingStatus',
      'doctorJoinStatus',
      'userJoinStatus',
      'callActive',
      'videoCallEnabled',
      'activeCallId',
      'source'
    ],
    'website paid appointment'
  );
  assert.strictEqual(appointment.patientId, patientId);
  assert.strictEqual(appointment.userId, patientId);
  assert.strictEqual(appointment.roomId, roomId);
  assert.strictEqual(appointment.videoRoomId, roomId);
  assert.strictEqual(appointment.source, 'website');

  const ringingPatch = buildConsultationStatusFields('ringing', appointmentId);
  assert.strictEqual(ringingPatch.status, 'ringing');
  assert.strictEqual(ringingPatch.paymentStatus, 'completed');
  assert.strictEqual(ringingPatch.appointmentStatus, 'confirmed');
  assert.strictEqual(ringingPatch.consultationQueueStatus, 'WAITING_IN_QUEUE');

  const payment = buildWebPaidPaymentFields({
    appointmentId,
    patientId,
    doctorId,
    doctorName: 'Doctor',
    patientName: 'Patient',
    patientPhone: '7842736777',
    amount: 500,
    paymentId: 'pay_contract_001',
    videoRoomId: roomId
  });
  assertFields(
    payment,
    [
      'appointmentId',
      'consultationId',
      'patientId',
      'doctorId',
      'amount',
      'status',
      'paymentStatus',
      'videoRoomId',
      'roomName',
      'serviceType',
      'source'
    ],
    'website paid payment'
  );
  assert.strictEqual(payment.roomName, roomId);
  assert.strictEqual(payment.videoRoomId, roomId);
  assert.strictEqual(payment.paymentStatus, 'completed');

  const accepted = buildAppAcceptedFields(appointmentId);
  assert.strictEqual(accepted.status, 'accepted');
  assert.strictEqual(accepted.consultationStatus, 'active');
  assert.strictEqual(accepted.appointmentStatus, 'active');
  assert.strictEqual(accepted.consultationQueueStatus, 'CALLING');
  assert.strictEqual(accepted.activeCallId, scheduledCallId(appointmentId));
  assert.strictEqual(accepted.videoCallEnabled, true);

  const inCall = buildAppInCallFields();
  assert.strictEqual(inCall.status, 'in_call');
  assert.strictEqual(inCall.consultationStatus, 'in_progress');
  assert.strictEqual(inCall.consultationQueueStatus, 'IN_CONSULTATION');
  assert.strictEqual(inCall.callActive, true);

  const completed = buildAppCompletedFields();
  assert.strictEqual(completed.status, 'completed');
  assert.strictEqual(completed.consultationStatus, 'completed');
  assert.strictEqual(completed.callActive, false);
  assert.strictEqual(completed.videoCallEnabled, false);

  const rejected = buildAppTerminalFields('rejected');
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.videoCallEnabled, false);
  assert.strictEqual(rejected.activeCallId, null);

  const activeCall = buildActiveCallRecord({
    appointmentId,
    appointment: { roomId, doctorId, patientId },
    doctorId,
    patientId
  });
  assertFields(
    activeCall,
    ['_id', 'callId', 'appointmentId', 'doctorId', 'patientId', 'status', 'callRoomId', 'provider'],
    'active call'
  );
  assert.strictEqual(activeCall._id, scheduledCallId(appointmentId));
  assert.strictEqual(activeCall.callRoomId, roomId);
  assert.strictEqual(activeCall.channelName, roomId);
  assert.strictEqual(activeCall.agoraChannel, roomId);
  assert.strictEqual(activeCall.provider, 'agora');
  assert.ok(Array.isArray(activeCall.participants), 'active call participants array');
  assert.deepStrictEqual(activeCall.participants, [doctorId, patientId]);
  assert.strictEqual(activeCall.caller, doctorId);
  assert.strictEqual(activeCall.callee, patientId);
  assert.strictEqual(
    canonicalVideoChannelForAppointment(appointment, appointmentId, scheduledCallId(appointmentId)),
    roomId
  );
  assert.strictEqual(
    canonicalVideoChannelForAppointment(appointment, appointmentId, appointmentId),
    roomId
  );
  assert.strictEqual(
    canonicalVideoChannelForAppointment(appointment, appointmentId, `consultation_${appointmentId}`),
    roomId
  );
  assert.strictEqual(canonicalizeAgoraChannelAlias(`consultation_${appointmentId}`), roomId);
  assert.strictEqual(canonicalizeAgoraChannelAlias('', appointmentId), roomId);
  const uidA = agoraUidForUserId('firebase-uid-abc');
  const uidB = agoraUidForUserId('firebase-uid-abc');
  assert.strictEqual(uidA, uidB);
  assert.ok(Number.isInteger(uidA) && uidA > 0);

  const acceptedPaymentPatch = buildPaymentLifecyclePatch('accepted', appointmentId);
  assert.strictEqual(acceptedPaymentPatch.status, 'accepted');
  assert.strictEqual(acceptedPaymentPatch.appointmentStatus, 'active');

  const refundedPaymentPatch = buildPaymentLifecyclePatch('refunded', appointmentId);
  assert.strictEqual(refundedPaymentPatch.paymentStatus, 'refunded');
  assert.strictEqual(refundedPaymentPatch.status, 'refunded');

  assert.strictEqual(patientCanJoinVideo('accepted'), true);
  assert.strictEqual(patientCanJoinVideo('in_call'), true);
  assert.strictEqual(patientCanJoinVideo('completed'), false);
  assert.strictEqual(normalizeConsultationStatus({ status: 'accepted', consultationStatus: 'active' }, null), 'accepted');
  assert.strictEqual(normalizeConsultationStatus({ consultationStatus: 'active' }, null), 'accepted');
  assert.strictEqual(normalizeConsultationStatus({ consultationStatus: 'in_progress' }, null), 'in_call');
  assert.strictEqual(
    normalizeConsultationStatus(null, { status: 'completed', paymentStatus: 'completed', roomName: roomId }),
    'ringing'
  );
  assert.strictEqual(isValidAgoraChannelName(roomId), true);
  assert.strictEqual(isValidAgoraChannelName('invalid room with spaces'), false);
  assert(Number.isInteger(agoraUidForUserId(patientId)), 'Agora UID must be numeric for native SDKs');

  const order = buildFirestoreOrderPayload(
    {
      userId: patientId,
      customerName: 'Patient',
      customerPhone: '7842736777',
      customerEmail: 'contact@dheergayush.net',
      deliveryAddress: 'Hyderabad',
      items: [
        {
          medicineId: 'med_001',
          storeId: 'store_001',
          name: 'Medicine',
          selectedWeight: '100g',
          pricePerUnit: 100,
          quantity: 2,
          totalPrice: 200
        }
      ],
      subtotal: 200,
      deliveryFee: 0,
      totalAmount: 200,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'pending',
      source: 'website'
    },
    'order_contract_001'
  );
  assertFields(
    order,
    [
      '_id',
      'user_id',
      'userId',
      'patientId',
      'items',
      'totalAmount',
      'total_amount',
      'totalPrice',
      'paymentStatus',
      'orderStatus',
      'status',
      'source',
      'sourceCollection'
    ],
    'store order'
  );
  assert.strictEqual(order.user_id, patientId);
  assert.strictEqual(order.userId, patientId);
  assert.strictEqual(order.patientId, patientId);
  assert.strictEqual(order.sourceCollection, 'orders');

  // Prescription-linked order auth contract
  assert.strictEqual(
    isPrescriptionLinkedOrder({ appointmentId: 'appt_1' }),
    true
  );
  assert.strictEqual(
    isPrescriptionLinkedOrder({ source: 'prescription' }),
    true
  );
  assert.strictEqual(isPrescriptionLinkedOrder({ source: 'website' }), false);

  const matchingPatient = evaluatePrescriptionOrderAuth({
    firebaseUid: patientId,
    orderData: { appointmentId, prescriptionId: appointmentId, source: 'prescription' },
    prescription: {
      patientId,
      sharedWithPatient: true,
      shareStatus: 'shared',
      appointmentId
    },
    appointment: { patientId, userId: patientId }
  });
  assert.strictEqual(matchingPatient.ok, true);
  assert.strictEqual(matchingPatient.userId, patientId);

  const missingToken = evaluatePrescriptionOrderAuth({
    firebaseUid: '',
    orderData: { appointmentId, source: 'prescription' }
  });
  assert.strictEqual(missingToken.ok, false);
  assert.strictEqual(missingToken.status, 401);

  const forgedUid = bindOrderIdentity(
    { userId: 'attacker', uid: 'attacker', appointmentId },
    patientId
  );
  assert.strictEqual(forgedUid.userId, patientId);
  assert.strictEqual(forgedUid.patientId, patientId);
  assert.strictEqual(forgedUid.uid, undefined);

  const otherPatient = evaluatePrescriptionOrderAuth({
    firebaseUid: 'other_patient_uid',
    orderData: { appointmentId, prescriptionId: appointmentId, source: 'prescription' },
    prescription: {
      patientId,
      sharedWithPatient: true,
      shareStatus: 'shared'
    }
  });
  assert.strictEqual(otherPatient.ok, false);
  assert.strictEqual(otherPatient.status, 403);

  const guestStripped = bindOrderIdentity(
    { userId: 'spoofed', uid: 'spoofed', customerName: 'Guest' },
    ''
  );
  assert.strictEqual(guestStripped.userId, undefined);
  assert.strictEqual(guestStripped.uid, undefined);

  const addressOrder = buildFirestoreOrderPayload(
    {
      userId: patientId,
      customerName: 'Patient',
      customerPhone: '7842736777',
      deliveryAddress: 'Hyderabad',
      deliveryAddressId: 'addr_1',
      deliveryAddressSnapshot: { line1: 'Hyderabad', pincode: '500001' },
      items: [{ medicineId: 'med_001', name: 'Medicine', pricePerUnit: 100, quantity: 1, totalPrice: 100 }],
      subtotal: 100,
      totalAmount: 100,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      source: 'prescription',
      appointmentId,
      prescriptionId: appointmentId
    },
    'order_rx_001'
  );
  assert.strictEqual(addressOrder.deliveryAddressId, 'addr_1');
  assert.strictEqual(addressOrder.appointmentId, appointmentId);
  assert.strictEqual(addressOrder.prescriptionId, appointmentId);
  assert.ok(addressOrder.deliveryAddressSnapshot);
}

run();
console.log('Cross-platform Firebase contract checks passed.');
