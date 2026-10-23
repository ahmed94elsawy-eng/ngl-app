// the User model requires 3..20 chars, Google names can be shorter/longer
export function toValidName(rawName, email) {
    let name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
    if (name.length >= 3) return name;

    // fallback: the part of the email before "@" (padded so it is never shorter than 3)
    const local = String(email).split('@')[0].slice(0, 20);
    return local.length >= 3 ? local : (local + 'user').slice(0, 20);
}