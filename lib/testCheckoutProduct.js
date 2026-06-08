/** Rs.1 product for Razorpay checkout smoke tests (always first in store catalog). */
const TEST_CHECKOUT_PRODUCT_ID = 'dheergayush_test_1rupee';

function getTestCheckoutProduct() {
  return {
    _id: TEST_CHECKOUT_PRODUCT_ID,
    name: 'Razorpay Test Item (Rs.1)',
    description:
      'Payment testing only - not shipped. Use domestic test card 4718 6091 0820 4366 or UPI success@razorpay.',
    category: 'Ayurvedic Medicines',
    brand: 'DHEERGAYUSH',
    company: 'DHEERGAYUSH Test',
    imageFile: '',
    imageUrl: '/logos/logo-horizontal.png',
    storeName: 'DHEERGAYUSH Test',
    storeId: 'dheergayush_test',
    weights: [{ value: 1, unit: 'unit', price: 1, pack_label: 'Test - Rs.1' }]
  };
}

module.exports = { TEST_CHECKOUT_PRODUCT_ID, getTestCheckoutProduct };
