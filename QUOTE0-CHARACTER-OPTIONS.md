# Quote/0 Character Replacement Options

The Quote/0 device doesn't support the `&` character. Here are your options:

## Option 1: Replace with + (Current)
```javascript
.replace(/&/g, '+')  // "p.80 & practi" → "p.80 + practi"
```

**Result**: `AE Math 3 p.80 + practi sht`

---

## Option 2: Replace with "and"
```javascript
.replace(/&/g, ' and ')  // "p.80 & practi" → "p.80 and practi"
```

**Result**: `AE Math 3 p.80 and practi sht`

⚠️ **Warning**: "and" is longer (3 chars vs 1), may cause text to exceed 29-char limit per line

---

## Option 3: Replace with "n"
```javascript
.replace(/&/g, 'n')  // "p.80 & practi" → "p.80 n practi"
```

**Result**: `AE Math 3 p.80 n practi sht`

---

## Option 4: Remove entirely
```javascript
.replace(/&/g, '')  // "p.80 & practi" → "p.80  practi"
```

**Result**: `AE Math 3 p.80  practi sht`

⚠️ **Warning**: Creates double spaces

---

## Option 5: Replace with comma
```javascript
.replace(/&/g, ',')  // "p.80 & practi" → "p.80 , practi"
```

**Result**: `AE Math 3 p.80 , practi sht`

---

## Recommendation

**Use `+` (current)**:
- ✅ Short (1 character)
- ✅ Similar meaning to "&"
- ✅ Won't exceed character limits
- ✅ Commonly understood

**Or avoid `&` when creating events**:
- Just write "AE Math 3 p.80 and practi sht" when entering the event

---

## How to Change

Edit `src/services/displayFormatterService.js`, line ~20:

```javascript
sanitizeForQuote0(text) {
  if (!text) return text;
  
  return text
    .replace(/&/g, '+')       // ← Change this line
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}
```

Replace `'+'` with your preferred option:
- `' and '` for "and"
- `'n'` for "n"
- `''` to remove
- `','` for comma
