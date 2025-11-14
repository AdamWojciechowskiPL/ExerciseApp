// netlify/functions/_crypto-helper.js

const crypto = require('crypto');

// Definicja stałych dla algorytmu szyfrowania AES-256-GCM.
// Jest to nowoczesny i bezpieczny standard szyfrowania uwierzytelnionego.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // Długość wektora inicjalizującego
const SALT_LENGTH = 64; // Długość "soli"
const TAG_LENGTH = 16; // Długość tagu uwierzytelniającego
const KEY_LENGTH = 32; // Długość klucza (256 bitów)
const PBKDF2_ITERATIONS = 100000; // Liczba iteracji dla funkcji wyprowadzania klucza

/**
 * Pobiera i waliduje sekretny klucz ze zmiennych środowiskowych.
 */
const getSecretKey = () => {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_SECRET_KEY must be defined in environment variables and be at least 32 characters long.');
  }
  return secret;
};

/**
 * Wyprowadza bezpieczny klucz szyfrujący z głównego sekretu i unikalnej soli.
 * Zapobiega to używaniu tego samego klucza dla różnych danych.
 */
const getKey = (salt) => {
  return crypto.pbkdf2Sync(getSecretKey(), salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
};

/**
 * Szyfruje podany tekst.
 * @param {string} text Tekst do zaszyfrowania.
 * @returns {string} Zaszyfrowany ciąg znaków w formacie hex, zawierający sól, IV, tag i zaszyfrowane dane.
 */
const encrypt = (text) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = getKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Zwracamy jeden ciąg znaków zawierający wszystkie komponenty potrzebne do deszyfrowania.
  return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
};

/**
 * Deszyfruje tekst zaszyfrowany za pomocą funkcji encrypt.
 * @param {string} encryptedText Zaszyfrowany ciąg znaków w formacie hex.
 * @returns {string} Odszyfrowany tekst.
 */
const decrypt = (encryptedText) => {
  const buffer = Buffer.from(String(encryptedText), 'hex');
  
  // Wyodrębniamy poszczególne komponenty z zaszyfrowanego ciągu.
  const salt = buffer.slice(0, SALT_LENGTH);
  const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = getKey(salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
};

module.exports = { encrypt, decrypt };