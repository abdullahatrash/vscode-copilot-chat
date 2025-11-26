# Patent Data Extraction - Visual Flow Guide

## OPS API Response → Extracted Data

### 1. Document ID & Date (Always Available)

```json
{
  "ops:publication-reference": {
    "document-id": {
      "country": { "$": "EP" },
      "doc-number": { "$": "1234567" },
      "kind": { "$": "A1" },
      "date": { "$": "20200101" }
    }
  }
}
```

**Extracted:**
- `docId`: "EP1234567.A1"
- `publicationDate`: "20200101"

---

### 2. Title (When Available)

```json
{
  "exchange-document": {
    "bibliographic-data": {
      "invention-title": [
        {
          "@language": "en",
          "$": "Method for quantum error correction"
        },
        {
          "@language": "de",
          "$": "Verfahren zur Quantenfehlerkorrektur"
        },
        {
          "@language": "fr",
          "$": "Méthode de correction d'erreur quantique"
        }
      ]
    }
  }
}
```

**Extraction Logic:**
```typescript
const titleArr = Array.isArray(titleData) ? titleData : [titleData];
const englishTitle = titleArr.find(t => t?.['@language'] === 'en');
const anyTitle = titleArr[0];
title = (englishTitle?.$ || anyTitle?.$ || null);
```

**Result:**
- `title`: "Method for quantum error correction" (English preferred)

---

### 3. Abstract (When Available)

```json
{
  "bibliographic-data": {
    "abstract": [
      {
        "@language": "en",
        "p": {
          "$": "The invention relates to a novel method for correcting errors in quantum computing systems using topological codes. The method comprises the steps of initializing a quantum state, detecting errors through syndrome measurements, and applying correction operations based on the detected error patterns."
        }
      },
      {
        "@language": "de",
        "p": {
          "$": "Die Erfindung betrifft ein neuartiges Verfahren..."
        }
      }
    ]
  }
}
```

**Extraction Logic:**
```typescript
const abstractArr = Array.isArray(abstractData) ? abstractData : [abstractData];
const englishAbstract = abstractArr.find(a => a?.['@language'] === 'en');
const anyAbstract = abstractArr[0];
const abstractText = englishAbstract?.p || anyAbstract?.p;

// Handle string or object with $
abstract = typeof abstractText === 'string' 
  ? abstractText 
  : (abstractText?.$ || null);
```

**Result:**
- `abstract`: "The invention relates to a novel method for correcting errors..."
- Formatted output: First 200 chars + "..."

---

### 4. Applicants (When Available)

```json
{
  "bibliographic-data": {
    "parties": {
      "applicants": {
        "applicant": [
          {
            "applicant-name": {
              "name": { "$": "IBM Corporation" }
            }
          },
          {
            "applicant-name": {
              "name": { "$": "University of Cambridge" }
            }
          }
        ]
      }
    }
  }
}
```

**Extraction Logic:**
```typescript
const applicantsData = partiesData.applicants.applicant;
const applicantsArr = Array.isArray(applicantsData) ? applicantsData : [applicantsData];

applicants = applicantsArr
  .map(app => {
    const nameData = app?.['applicant-name'];
    if (nameData) {
      const nameArr = Array.isArray(nameData) ? nameData : [nameData];
      return nameArr[0]?.name?.$ || nameArr[0]?.$ || null;
    }
    return null;
  })
  .filter(name => name !== null);
```

**Result:**
- `applicants`: ["IBM Corporation", "University of Cambridge"]

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   EPO OPS API Response                          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ops:world-patent-data                                          │
│  └── ops:biblio-search                                          │
│      └── ops:search-result                                      │
│          ├── @total-result-count: "100"                         │
│          ├── ops:publication-reference [Array]                  │
│          │   └── document-id                                    │
│          │       ├── country.$: "EP"        ──┐                 │
│          │       ├── doc-number.$: "1234567" ─┼─► docId         │
│          │       ├── kind.$: "A1"            ──┘                │
│          │       └── date.$: "20200101"     ───► publicationDate│
│          │                                                       │
│          └── exchange-documents [Optional]                      │
│              └── exchange-document [Array]                      │
│                  └── bibliographic-data                         │
│                      ├── invention-title [Array]                │
│                      │   ├── @language: "en"  ┐                 │
│                      │   └── $: "Method..."  ─┼─► title         │
│                      │                                           │
│                      ├── abstract [Array]                       │
│                      │   ├── @language: "en"  ┐                 │
│                      │   └── p.$: "The inv..." ┼─► abstract     │
│                      │                                           │
│                      └── parties                                │
│                          └── applicants                         │
│                              └── applicant [Array]              │
│                                  └── applicant-name             │
│                                      └── name.$  ──► applicants │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Extracted Data                             │
├─────────────────────────────────────────────────────────────────┤
│  {                                                              │
│    docId: "EP1234567.A1",                                       │
│    title: "Method for quantum error correction",               │
│    abstract: "The invention relates to...",                    │
│    applicants: ["IBM Corporation", "University of Cambridge"], │
│    publicationDate: "20200101"                                  │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Formatted Output                             │
├─────────────────────────────────────────────────────────────────┤
│  EP1234567.A1                                                   │
│    Title: Method for quantum error correction                  │
│    Applicants: IBM Corporation, University of Cambridge        │
│    Published: 20200101                                          │
│    Abstract: The invention relates to a novel method for       │
│              correcting errors in quantum computing systems...  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Location Map

```
searchPatentsTool.ts
├── Line 215: Get publication-reference (always present)
├── Lines 221-223: Get exchange-documents (if available)
│
├── Lines 225-301: For each patent:
│   ├── Lines 230-235: Extract docId from publication-reference
│   │   └── Result: "EP1234567.A1"
│   │
│   ├── Lines 244-256: Extract title from bibliographic-data
│   │   ├── Find English title
│   │   └── Result: "Method for quantum error correction"
│   │
│   ├── Lines 258-271: Extract abstract from bibliographic-data
│   │   ├── Find English abstract
│   │   ├── Get text from <p> element
│   │   └── Result: "The invention relates to..."
│   │
│   ├── Lines 273-289: Extract applicants from parties
│   │   ├── Map applicant-name elements
│   │   ├── Extract name.$ values
│   │   └── Result: ["IBM Corporation", "University of Cambridge"]
│   │
│   └── Line 239: Get publicationDate from document-id
│       └── Result: "20200101"
│
└── Lines 335-364: Format results for display
    └── Output: Rich patent information with all fields
```

---

## Edge Cases Handled

### Case 1: No Exchange Documents
```json
{
  "ops:search-result": {
    "ops:publication-reference": [...]
    // No exchange-documents
  }
}
```
**Result:** Only docId and publicationDate extracted
**Behavior:** Graceful degradation, no errors

### Case 2: Single Language Title
```json
{
  "invention-title": {
    "@language": "fr",
    "$": "Méthode de correction"
  }
}
```
**Result:** Uses available language (French)
**Behavior:** Falls back to any available language

### Case 3: String Abstract (not object)
```json
{
  "abstract": {
    "p": "The invention relates to..."  // Direct string
  }
}
```
**Result:** Handles both string and object with $
**Behavior:** typeof check handles both formats

### Case 4: Single Applicant (not array)
```json
{
  "applicant": {
    "applicant-name": {
      "name": { "$": "IBM Corporation" }
    }
  }
}
```
**Result:** Converts to array for uniform processing
**Behavior:** Array.isArray() check handles both

---

## Testing Checklist

### ✅ Test with Real API
1. Launch extension (F5)
2. Use @SearchPatents in chat
3. Query: "quantum computing"
4. Verify output shows:
   - [x] Document IDs
   - [x] Titles (if available)
   - [x] Applicants (if available)
   - [x] Publication dates
   - [x] Abstract previews (if available)

### ✅ Check Logs
```
[SearchPatentsTool] Processing 25 patent references
[SearchPatentsTool] Extracted data: {
  docId: "EP1234567.A1",
  title: "Method for quantum error correction",
  abstract: "The invention relates to...",
  applicants: ["IBM Corporation"]
}
```

### ✅ Verify Graceful Degradation
- Query with no exchange-documents should still work
- Missing fields should be null/empty array
- No errors in console

---

## Quick Reference

| Field | Always Available? | Format | Location in API |
|-------|-------------------|--------|-----------------|
| `docId` | ✅ Yes | `"EP1234567.A1"` | `publication-reference/document-id` |
| `publicationDate` | ✅ Yes | `"20200101"` | `publication-reference/document-id/date.$` |
| `title` | ⚠️ Maybe | `"Method for..."` | `exchange-document/bibliographic-data/invention-title.$` |
| `abstract` | ⚠️ Maybe | `"The invention..."` | `exchange-document/bibliographic-data/abstract/p.$` |
| `applicants` | ⚠️ Maybe | `["IBM Corp", ...]` | `exchange-document/bibliographic-data/parties/applicants/applicant/applicant-name/name.$` |

**Legend:**
- ✅ Always: Present in basic search response
- ⚠️ Maybe: Only present if exchange-documents included

---

**File:** `PATENT_DATA_FLOW.md`
**Purpose:** Visual guide for understanding data extraction
**See Also:** `PATENT_DATA_EXTRACTION_GUIDE.md` (complete implementation guide)
