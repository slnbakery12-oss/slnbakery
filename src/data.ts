export type BusinessInfo = {
  name: string;
  tagline: string;
  address: string;
  cityState: string;
  phone: string;
  mapsUrl: string;
  ownerName: string;
  email: string;
  openingHours: string;
};

export const defaultBusinessInfo: BusinessInfo = {
  name: 'Sri Laxmi Narasimha Bakery',
  tagline: 'Baked with love. Always.',
  address: '9-2-5, Siddipet, Bejjanki, Telangana 505528',
  cityState: 'Bejjanki, Telangana',
  phone: '07799801078',
  mapsUrl: 'https://maps.app.goo.gl/eBLLt3mn3tqb87DR9?g_st=iw',
  ownerName: '',
  email: '',
  openingHours: '',
};

export type Product = {
  id: number; name: string; price: number; category: string; tags: string[];
  image: string; description: string; rating: number; bestseller: boolean; available: boolean;
};
export type CartItem = Product & { key: string; weight: string; egg: string; message: string; qty: number; date: string; unitPrice: number };
export type Order = {
  id: string; customer: string; email: string; phone: string; address: string;
  date: string; time: string; payment: string; instructions: string;
  items: CartItem[]; total: number; status: number; createdAt: number; sample: boolean;
};
export const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const steps = ['Order Placed', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Out for Delivery', 'Delivered'];
export const categories = ['Birthday Cakes', 'Anniversary Cakes', 'Wedding Cakes', 'Photo Cakes', 'Chocolate Cakes', 'Butterscotch Cakes', 'Pastries', 'Cupcakes', 'Cookies', 'Breads', 'Puffs', 'Desserts'];
const img = (id: string, w = 700) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
export const initialProducts: Product[] = [
  { id: 1, name: 'Strawberry Cloud Cake', price: 749, category: 'Birthday Cakes', tags: ['Photo Cakes'], image: img('photo-1464305795204-6f5bbfc7fb81'), description: 'Pillowy vanilla sponge, clouds of fresh cream, and a generous layer of juicy strawberries. A little slice of sunshine, made by hand.', rating: 4.9, bestseller: true, available: true },
  { id: 2, name: 'Belgian Chocolate Truffle', price: 899, category: 'Chocolate Cakes', tags: ['Birthday Cakes', 'Photo Cakes'], image: img('photo-1578985545062-69928b1d9587'), description: 'Rich Belgian chocolate ganache meets moist cocoa sponge. Deeply chocolatey, wonderfully indulgent, and impossible to share.', rating: 4.9, bestseller: true, available: true },
  { id: 3, name: 'Golden Butterscotch Bliss', price: 699, category: 'Butterscotch Cakes', tags: ['Birthday Cakes'], image: img('photo-1535141192574-5d4897c12636'), description: 'Buttery caramel, golden praline crunch, and soft vanilla sponge. A timeless favourite with a little extra magic.', rating: 4.8, bestseller: true, available: true },
  { id: 4, name: 'Rose & Vanilla Romance', price: 999, category: 'Anniversary Cakes', tags: ['Wedding Cakes'], image: img('photo-1627834377411-8da5f4f09de8'), description: 'Delicate vanilla bean sponge wrapped in rose-kissed buttercream. Elegant, fragrant, and made for your forever moments.', rating: 4.9, bestseller: true, available: true },
  { id: 5, name: 'Little Cupcake Collection', price: 449, category: 'Cupcakes', tags: [], image: img('photo-1486427944299-d1955d23e34d'), description: 'A delightful box of six cupcakes with silky buttercream swirls. Small enough for a little treat, lovely enough to make someone’s day.', rating: 4.8, bestseller: false, available: true },
  { id: 6, name: 'Berry Sweet Cheesecake', price: 849, category: 'Desserts', tags: ['Pastries'], image: img('photo-1533134242443-d4fd215305ad'), description: 'Silky baked cream cheese on a golden biscuit base, finished with a bright berry compote. A beautiful balance of creamy and fresh.', rating: 4.9, bestseller: false, available: true },
  { id: 7, name: 'Chocolate Chunk Cookies', price: 349, category: 'Cookies', tags: [], image: img('photo-1499636136210-6f4ee915583e'), description: 'Crisp edges, a soft centre, and generous chunks of dark chocolate. Six cookies, baked fresh for your afternoon cup.', rating: 4.7, bestseller: false, available: true },
  { id: 8, name: 'The Morning Butter Box', price: 399, category: 'Breads', tags: ['Puffs', 'Pastries'], image: img('photo-1555507036-ab1f4038808a'), description: 'Golden, flaky, beautifully buttery pastries. Our morning selection of croissants and savoury puffs, baked for slow mornings.', rating: 4.8, bestseller: false, available: true },
];
const today = new Date().toLocaleDateString('en-CA');
export const initialOrders: Order[] = [
  { id: 'BC1042', customer: 'Ananya Sharma', email: 'ananya@example.com', phone: '+91 98901 23456', address: '14 Gandhi Road, Bejjanki, Telangana 505528', date: today, time: '4 PM – 7 PM', payment: 'Cash on delivery', instructions: 'Please ring the bell.', items: [{ ...initialProducts[0], key: 'sample1', weight: '1kg', egg: 'Eggless', message: 'Happy Birthday, Maa!', qty: 1, date: today, unitPrice: 1423 }], total: 1423, status: 0, createdAt: Date.now() - 3600000, sample: true },
  { id: 'BC1041', customer: 'Rahul Mehta', email: 'rahul@example.com', phone: '+91 98765 44321', address: '8 Main Bazar, Siddipet, Telangana 502103', date: today, time: '1 PM – 4 PM', payment: 'UPI — simulated payment', instructions: '', items: [{ ...initialProducts[1], key: 'sample2', weight: '500g', egg: 'Eggless', message: 'Our sweetest year', qty: 1, date: today, unitPrice: 899 }], total: 948, status: 2, createdAt: Date.now() - 7200000, sample: true },
  { id: 'BC1040', customer: 'Priya Kapoor', email: 'priya@example.com', phone: '+91 98201 54321', address: '22 Collectorate Road, Siddipet, Telangana 502103', date: today, time: '10 AM – 1 PM', payment: 'Cash on delivery', instructions: '', items: [{ ...initialProducts[3], key: 'sample3', weight: '1kg', egg: 'With egg', message: 'Happy Anniversary', qty: 1, date: today, unitPrice: 1898 }], total: 1898, status: 5, createdAt: Date.now() - 86400000, sample: true },
  { id: 'BC1039', customer: 'Ananya Sharma', email: 'ananya@example.com', phone: '+91 98901 23456', address: '14 Gandhi Road, Bejjanki, Telangana 505528', date: today, time: '4 PM – 7 PM', payment: 'Cash on delivery', instructions: '', items: [{ ...initialProducts[4], key: 'sample4', weight: '500g', egg: 'Eggless', message: '', qty: 2, date: today, unitPrice: 449 }], total: 947, status: 5, createdAt: Date.now() - 259200000, sample: true },
];
