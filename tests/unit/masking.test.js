/* Personal data masking: each kind of value is told apart by its own check (card numbers by the Luhn digit, bank accounts by the IBAN
   check, addresses by the 255 limit) so dates, ids and timestamps are left alone, and a phone number is found by how it is written or
   by the key it sits under. */
const { load, test, eq, truthy } = require('./harness');

load(['personal-data-masker']);
const masker = Structra.personalDataMasker;
const typeOf = (value, key) => (masker.detectAndMask(value, key) || {}).type || null;

console.log('personal data masking');

test('card numbers pass the Luhn check; the test numbers of the card companies are found, in groups or not', () => {
  for (const card of ['4111 1111 1111 1111', '4111111111111111', '5500-0000-0000-0004', '3782 822463 10005', '378282246310005', '6011 1111 1111 1117', '4012888888881881']) eq(typeOf(card), 'creditcard', card);
  eq(masker.detectAndMask('4111 1111 1111 1111').masked, '**** **** **** 1111');
});

test('a long number that fails the check digit is not a card: ids and timestamps stay as they are', () => {
  for (const value of ['1234 5678 9012 3456', '1234567890123456', '20250314123045', '1234567890123', '0000 0000 0000 0001']) eq(typeOf(value), null, value);
});

test('the Luhn function itself', () => {
  truthy(masker.luhn('79927398713'));
  truthy(!masker.luhn('79927398710'));
  truthy(masker.luhn('4242424242424242'));
});

test('bank account numbers (IBAN) pass the mod 97 check, written with or without spaces', () => {
  for (const iban of ['GB82 WEST 1234 5698 7654 32', 'GB82WEST12345698765432', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606', 'NO93 8601 1117 947']) eq(typeOf(iban), 'iban', iban);
  eq(typeOf('GB82 WEST 1234 5698 7654 33'), null, 'a wrong check digit');
  eq(typeOf('AB12 CDEF'), null);
  eq(masker.detectAndMask('GB82 WEST 1234 5698 7654 32').masked, 'GB82 **** **** 5432');
});

test('IP addresses: four numbers up to 255; a number over 255 is not an address', () => {
  eq(typeOf('192.168.1.1'), 'ip');
  eq(masker.detectAndMask('10.20.30.40').masked, '10.20.***.***');
  eq(typeOf('256.1.1.1'), null);
  eq(typeOf('1.2.3'), null);
});

test('US social security numbers, but not the ranges that are never issued', () => {
  eq(typeOf('123-45-6789'), 'ssn');
  eq(masker.detectAndMask('123-45-6789').masked, '***-**-6789');
  for (const value of ['000-12-3456', '666-12-3456', '900-12-3456', '123-00-4567', '123-45-0000']) truthy(typeOf(value) !== 'ssn', value);   // (written in groups, they may still read as a phone number)
});

test('phone numbers written as phone numbers are found, the last four digits stay', () => {
  eq(masker.detectAndMask('+44 20 7946 0958').masked, '+** ** **** 0958');
  eq(masker.detectAndMask('(555) 123-4567').masked, '(***) ***-4567');
  eq(masker.detectAndMask('555-123-4567').masked, '***-***-4567');
  eq(masker.detectAndMask('555.123.4567').masked, '***.***.4567');
  eq(masker.detectAndMask('+15551234567').masked, '+*******4567');
  eq(typeOf('+49 30 123456'), 'phone');
});

test('a date, a plain run of digits, a version and a price are not phone numbers', () => {
  for (const value of ['2025-03-14', '14.03.2025', '03/14/2025', '1234567890', '5551234567', '20250314123045', '1299.50', '12345678']) eq(typeOf(value), null, value);
});

test('a plain run of digits under a key that says phone is a phone number', () => {
  eq(typeOf('5551234567', 'phone'), 'phone');
  eq(typeOf('5551234567', 'mobile_number'), 'phone');
  eq(typeOf('5551234567', 'Telephone'), 'phone');
  eq(typeOf('5551234567', 'id'), null);
  eq(typeOf('12', 'phone'), null, 'too short');
});

test('email, UUID and names keep working', () => {
  eq(masker.detectAndMask('ann.lee@contoso.com').masked, 'a***@***.com');
  eq(masker.detectAndMask('Send to bob@x.org now').masked, 'Send to b***@***.org now');
  eq(typeOf('123e4567-e89b-12d3-a456-426614174000'), 'uuid');
  const out = masker.maskData({ displayName: 'Ann Lee', note: 'hi' });
  eq(out.data.displayName, 'A*** L***');
  eq(out.count, 1);
});

test('maskData masks nested values, lists and keys named like phone, and counts them', () => {
  const doc = { users: [{ id: '1234567890', phone: '5551234567', email: 'a@b.co', card: '4111 1111 1111 1111', joined: '2025-03-14' }], ip: '8.8.4.4' };
  const out = masker.maskData(doc);
  eq(out.data.users[0].id, '1234567890');
  eq(out.data.users[0].phone, '******4567');
  eq(out.data.users[0].card, '**** **** **** 1111');
  eq(out.data.users[0].joined, '2025-03-14');
  eq(out.data.ip, '8.8.***.***');
  eq(out.count, 4);
  eq(masker.scan(doc), 4);
});
