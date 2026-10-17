# 02 — Original specification (verbatim)

This is the requirements document the project started from, kept word for word. Two things to know when reading it:

* **It was later corrected by the business owner** (see `01_PROJECT_BRIEF.md`, "The core concept"): the workbooks named in sections 1, 2, 12, 29 and 30 are **reference material for structure and verification only**; the engine is the system of record, costing values are entered in the engine, only the CAD and the style image are uploaded, and the Excel files are outputs. Wherever this text says "import the Excel files as the initial dataset" or "do not create fake demo styles if real styles exist in the attached files", read it through that correction: the real styles are **not** stored in the engine.
* The three attached files it refers to were: an actual-costing workbook (28 sheets), a client-costing workbook (1 sheet, style 5008, the GET layout) and a CAD marker PDF (style 72232). Copies are in `reference-data/` and in `project-source/data/reference/` and `project-source/tests/fixtures/`.

---

You are building a production-grade Cost Engine for a garment/textile manufacturing company.

I have attached 3 source files that you MUST study carefully before writing the application:

1. actual costing.xlsx
2. client costing.xlsx
3. cad.pdf

These are real costing files from the business. The application must be based on the actual structure, terminology, calculations and data contained in these files.

DO NOT treat these as sample/demo files.
DO NOT invent costing fields that are not supported by the source files.
DO NOT simplify the costing structure.
DO NOT replace business terminology with generic ERP terminology unless necessary.
DO NOT hardcode the values from these files into the application.

==================================================
1. CORE OBJECTIVE
==================================================

Build a modular, premium-looking Cost Engine that calculates and displays TWO costing perspectives for the same garment/style:

A. ACTUAL COSTING
The actual estimated/manufacturing cost to the company for producing the garment.

B. CLIENT COSTING
The costing/quoted cost presented to the client, which can be higher than actual cost and therefore contains the commercial margin/profit structure.

The system must allow the user to switch between:

[ ACTUAL COSTING ] [ CLIENT COSTING ]

and immediately see the appropriate costing structure and calculated result.

The two costing systems must remain logically separate.

Do NOT simply apply a fixed markup to Actual Costing to create Client Costing.

The client costing and actual costing are separate business datasets with their own cost components, quantities, rates and calculations.

==================================================
2. FIRST TASK — STUDY THE ATTACHED FILES
==================================================

Before implementing the UI, thoroughly inspect all three files.

For actual costing.xlsx:

- Inspect ALL worksheets.
- Identify the common structure across worksheets.
- Identify style numbers and color/variant information.
- Identify all recurring costing sections.
- Identify all recurring cost items.
- Identify formulas.
- Identify how quantities are calculated.
- Identify how rates are applied.
- Identify how Total Cost is calculated.
- Identify Cost per PC.
- Identify Profit.
- Identify Per PC Profit.
- Identify Rejection.
- Identify Total Value Loss.
- Identify Value Loss %.
- Identify CMT variations such as:
  - CMT
  - CMT KURTA
  - CMT BOTTOM
- Identify all fabric items.
- Identify all trims.
- Identify LD CHARGES.
- Identify freight.
- Identify packaging.
- Identify labels.
- Identify embroidery/print/hand work/etc.

Do not assume that every worksheet has exactly the same components.
The engine must support variable components.

For client costing.xlsx:

Study the entire workbook and preserve its structure.

The current source contains fields such as:

Product ID
Design ID
Cost Item category
Cost Item
Description
Item Type
Quantity
Quantity UOM
HS Code
Duty%
Price without GST
Base Total (W/o GST Factor)
Base Total (With GST)
GST
Input Cost
Currency
Fabric Type
Fabric Finish
Fabric Construction & Content W/ Percentage
Knit Gauge
Cuttable Width
Source
Costing Scenario
Action

The source also contains categories/components such as:

Fabric
Sewing trims
Label & Tags
Packing Trims
EMB
PRINT
CM
Testing
Garment Rejection
Overhead+Margin
Finance Cost
Transport

and final calculations such as:

Total
Total Cost
FOB Price
Finance Cost
FINAL PO PRICE
Transport
FINAL PO PRICE Incl Transport

These must be represented properly in the Client Costing engine.

IMPORTANT:

Preserve the distinction between:
- quantity
- UOM
- rate/price
- GST
- base total
- input cost
- total cost
- margin/overhead
- finance cost
- transport
- final PO price

Do not collapse these into one generic "cost" field.

==================================================
3. CAD PDF EXTRACTION
==================================================

The attached CAD PDF is extremely important.

The user will upload:

A. Style/Product image
B. CAD file/PDF

The CAD file must be used as the source for garment consumption and CAD-related measurements.

For example, the supplied CAD contains information such as:

Style Name / Style Number
Sets
Length
Width
Efficiency
Length per Set
Surface's Pieces Count
Total Length
Total Pieces

The application must extract these values from the CAD rather than asking the user to manually enter them whenever the CAD contains them.

The system should support CAD PDFs with slightly different layouts.

Build a CAD extraction layer rather than hardcoding coordinates for one PDF.

The CAD parser should attempt to identify:

- Style number
- CAD length
- CAD width
- Efficiency %
- Length per set
- Total length
- Total pieces
- Pieces count
- Size breakdown where available
- Set information where available
- Any other relevant CAD metadata

The engine should clearly display:

CAD DATA

Style Number: XXXXX
Length: X.XX m
Width: XX"
Efficiency: XX.XX%
Length / Set: X.XX m
Total Pieces: XXX

If extraction confidence is low, show the extracted value as editable and clearly indicate that manual verification is required.

NEVER silently guess CAD values.

==================================================
4. USER WORKFLOW
==================================================

The main workflow should be:

STEP 1
Select Customer / Brand

Dropdown/searchable selector.

STEP 2
Enter Style Number

Example:
72232

STEP 3
Upload Style Image

Show a premium image preview.

STEP 4
Upload CAD File

PDF upload.

Automatically extract CAD data.

STEP 5
Select Category

Examples should be driven by the source data/configuration rather than hardcoded assumptions.

STEP 6
Select Costing Mode

[ Actual Costing ]
[ Client Costing ]

==================================================
5. COSTING INPUT STRUCTURE
==================================================

The costing interface should visually follow this concept:

CUSTOMER / BRAND
STYLE NUMBER
STYLE IMAGE
CATEGORY

--------------------------------------------

CAD INFORMATION

Fabric      | Width | Length | Consumption
Fabric 1
Fabric 2
Fabric 3
...

--------------------------------------------

PARTICULARS | COUNT | RATE | UOM | TOTAL

Fabric 1
Fabric 2
Fabric 3
Embroidery
Printing
CMT
Labels
Trims
Packaging
etc.

But the exact rows/components must dynamically come from the selected costing dataset.

Do NOT force every style to have Fabric 1, Fabric 2, Fabric 3 if the source data does not contain them.

The UI must dynamically support:

Add component
Remove component
Edit quantity
Edit rate
Change UOM
Edit description
Edit relevant attributes

while maintaining the underlying costing structure.

==================================================
6. ACTUAL COSTING ENGINE
==================================================

The Actual Costing view must reproduce the logic of actual costing.xlsx.

It should support sections such as:

ORDER INFORMATION

Order PCS
Dispatch PCS

FABRIC

Consumption
Fabric 1
Fabric 2
Fabric 3
...
Total Fabric Cost

CMT

CMT
CMT Kurta
CMT Bottom
etc.

TRIMS

Main Label
Size Label
Wash Care
Flag Label
Wooden Button
Size Sticker
Price Tag
Prepack Stickers
Match It Tag
Polybag RFID
RFID Poly Bag
Carton
Master Polybag
Carton Sticker
Freight
Hardtags
etc.

LD CHARGES

TOTAL COST

COST PER PC

PROFIT

PER PC PROFIT

REJECTION

Fabric A
Fabric B
Garment A
Garment B

TOTAL VALUE LOSS

VALUE LOSS %

The exact sections and components should be configurable based on the actual costing workbook.

Do not assume that every style uses every component.

==================================================
7. CLIENT COSTING ENGINE
==================================================

The Client Costing view must reproduce the logic of client costing.xlsx.

Organize the cost items by Cost Item category.

For example:

FABRIC

Main Fabric
Trim Fabric 1
Fabric
etc.

SEWING TRIMS

Sewing Thread
Fusing
Button
Tassle
Dori
Beeds
Lace
etc.

LABEL & TAGS

Main Label
Size Label
Loop Label
Wash Care
Barcode Tag
Barcode Sticker
Barcode
SLV Tag
Transparent Tag
etc.

PACKING TRIMS

Carton
Polybag
Master Polybag
Size Sticker
Strapping + Wrapping + Tissue
Divider
Gum Tape
etc.

EMB

PRINT

CM

TESTING

GARMENT REJECTION

OVERHEAD + MARGIN

FINANCE COST

TRANSPORT

FINAL PO PRICE

The system should preserve the calculation chain from the original workbook.

==================================================
8. CAD → COSTING CONNECTION
==================================================

This is one of the most important requirements.

CAD-derived values should feed the costing calculation wherever applicable.

For example:

CAD Consumption
× Fabric Rate
= Fabric Cost

or wherever the source costing structure indicates that consumption/quantity should be used.

Do not blindly substitute CAD values into every quantity field.

Instead:

1. Identify which fields in the source costing files represent consumption.
2. Identify which fields are actual quantity.
3. Identify which quantities are calculated from order quantity.
4. Map CAD-derived values to the appropriate fields.
5. Show the source of each calculated value.

For example:

Consumption
1.60 m
Source: CAD

Fabric Rate
₹77.00/m
Source: Cost Master / Client Costing

Fabric Cost
₹123.20/pc

Every automatically derived number should have a clear data provenance where practical.

==================================================
9. ACTUAL VS CLIENT COMPARISON
==================================================

Add a dedicated comparison view.

Display:

ACTUAL COST / PC
CLIENT COST / PC
DIFFERENCE / PC
CLIENT PREMIUM %
TOTAL ACTUAL COST
TOTAL CLIENT COST
TOTAL DIFFERENCE
MARGIN / PROFIT

Example layout:

                ACTUAL       CLIENT       DIFFERENCE

Fabric          ₹xxx         ₹xxx          ₹xx
CMT             ₹xxx         ₹xxx          ₹xx
Trims           ₹xxx         ₹xxx          ₹xx
Packaging       ₹xxx         ₹xxx          ₹xx
Other           ₹xxx         ₹xxx          ₹xx
----------------------------------------------------
TOTAL           ₹xxx         ₹xxx          ₹xx

This comparison must be calculated from the actual underlying costing data.

Do not invent a percentage.

==================================================
10. CUSTOMER / BRAND ARCHITECTURE
==================================================

Create a proper master-data architecture.

Customer / Brand should NOT be hardcoded into the UI.

Create a configurable master such as:

Customer
Brand
Category
Style
Costing Version
Costing Type

The source files may not contain enough information to automatically establish every Customer/Brand mapping.

Therefore:

- Do not invent mappings.
- Build the architecture so mappings can be configured.
- Allow an administrator to assign a style to a customer/brand.
- Keep this mapping separate from the costing calculation engine.

==================================================
11. DATA ARCHITECTURE
==================================================

Build this as a modular application.

Separate:

1. UI
2. Costing engine
3. CAD parser
4. Excel parser
5. Data normalization layer
6. Cost master
7. Customer/brand master
8. Style master
9. Actual costing repository
10. Client costing repository
11. Calculation engine
12. Comparison engine

The costing engine should NEVER depend directly on UI components.

For example:

/src
  /components
  /pages
  /features
      /costing
      /cad
      /styles
      /customers
      /comparison
      /masters
  /lib
      /calculations
      /parsers
      /normalization
      /validation
  /data
  /types
  /services

Use strong typing throughout.

==================================================
12. EXCEL IMPORT ENGINE
==================================================

Create a robust Excel ingestion layer.

It must be able to:

- Read actual costing.xlsx
- Read client costing.xlsx
- Detect worksheets
- Detect headers
- Normalize column names
- Preserve formulas where necessary
- Read calculated values where available
- Identify styles
- Identify components
- Identify categories
- Store source worksheet references

Do not manually copy spreadsheet values into JavaScript/TypeScript.

The Excel files should act as importable source data.

Create a normalized internal schema.

For example:

Style
Customer
Brand
Color
Category
CostingType
CostSection
CostItem
Description
Quantity
UOM
Rate
GST
Currency
Source
Formula
Total
Metadata

The schema should be extensible.

==================================================
13. CALCULATION ENGINE
==================================================

All calculations must be centralized.

Do NOT scatter calculations across React components.

Create functions/services such as:

calculateFabricCost()
calculateTrimCost()
calculateCMTCost()
calculatePackingCost()
calculateActualCost()
calculateClientCost()
calculateProfit()
calculateValueLoss()
calculateFinanceCost()
calculateTransport()
calculateFinalPOPrice()
compareCostings()

The formulas should be derived from the source spreadsheets wherever formulas exist.

For example, if a source sheet calculates:

quantity × rate = purchase cost

preserve that relationship.

If a source formula is more complex, reproduce the logic accurately.

Do not replace a business formula with an arbitrary formula just because it looks simpler.

==================================================
14. PREMIUM UI / UX
==================================================

The application must look like a premium enterprise costing platform.

NOT like an Excel spreadsheet converted into a website.

Use a modern, restrained enterprise aesthetic.

Recommended:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- clean typography
- subtle borders
- restrained shadows
- excellent spacing
- responsive layouts
- premium cards
- sticky calculation summary
- smooth transitions
- excellent tables
- searchable dropdowns
- drag-and-drop file uploads
- image preview
- PDF/CAD preview

Avoid:

- excessive gradients
- excessive animations
- childish UI
- huge rounded cards
- unnecessary decorative elements
- clutter

The primary purpose is accuracy and speed.

==================================================
15. MAIN SCREEN
==================================================

Create a dashboard-like Cost Engine interface.

Top:

UNITED TEXTILE MILLS
Cost Engine

Then:

Customer / Brand
Style Number
Category
Costing Mode

Then a large two-column area:

LEFT:
Style image
CAD upload / preview
CAD extracted information

RIGHT:
Costing summary

For example:

ACTUAL COST
₹ XXX / PC

CLIENT COST
₹ XXX / PC

DIFFERENCE
₹ XX / PC

Then detailed costing below.

==================================================
16. COSTING TABLE
==================================================

Create a sophisticated editable costing table.

Columns may include:

Particular
Description
Quantity
UOM
Rate
GST
Cost
Source
Actions

But columns should be configurable depending on the costing mode.

Allow users to expand/collapse sections:

Fabric
CMT
Trims
Labels
Packing
Embroidery
Printing
Testing
Overheads
etc.

Each section should show a subtotal.

At the bottom:

TOTAL COST / PC

and a sticky summary card.

==================================================
17. SOURCE TRACEABILITY
==================================================

This is critical.

Every imported/derived number should ideally be traceable to its source.

Example:

₹77.00

Source:
Client Costing → Sheet 5008 → Main Fabric → Price without GST

or:

1.60 m

Source:
CAD → Style 72232 → extracted consumption

This can appear through a tooltip or source indicator.

The user should be able to understand:

"Where did this number come from?"

==================================================
18. VALIDATION
==================================================

Build validation into the system.

Examples:

- Style number missing
- Customer missing
- CAD missing
- CAD style number does not match entered style number
- Width missing
- Consumption missing
- Rate missing
- Quantity missing
- UOM missing
- Invalid GST
- Negative quantity
- Negative rate
- Duplicate cost component

Show clear warnings.

Do not silently calculate with missing critical data.

==================================================
19. STYLE MATCHING
==================================================

The system should intelligently match:

Entered Style Number
↕
Actual costing worksheet
↕
Client costing Product ID
↕
CAD Style Number

Because the source files may represent styles differently.

For example:

72232
GETKRTSCUT5008 - BLACK
etc.

Build a normalization/matching layer.

Do not assume exact string equality.

However, NEVER silently match an uncertain style.

If confidence is low:

"Possible match found — please confirm."

==================================================
20. ADMIN / MASTER DATA
==================================================

Create an Admin/Masters section.

Include:

Customers
Brands
Categories
Styles
Cost Items
Cost Categories
UOMs
Fabric Masters
Rate Masters
Costing Rules
Mappings

This should make the engine scalable.

The current Excel files are the initial data source, but the application should be architected so that later the data can be moved into a database/API without rewriting the UI or calculation engine.

==================================================
21. DATABASE / PERSISTENCE
==================================================

Use a proper database architecture rather than relying only on browser localStorage.

Prefer a setup that can eventually support multiple users.

Use a clean ORM/schema.

Recommended if appropriate:

PostgreSQL + Prisma

However, choose the best practical architecture if there is a strong reason to use something else.

The application should support:

- saved styles
- saved costings
- costing versions
- customer mappings
- uploaded style images
- CAD files
- costing history

==================================================
22. VERSIONING
==================================================

Costings must be versionable.

Example:

Style 72232

Client Costing v1
Client Costing v2
Actual Costing v1

Each version should store:

- date
- user
- source
- changed fields
- calculated total
- costing type

Do not overwrite historical costing data.

==================================================
23. AUDITABILITY
==================================================

For an enterprise costing application, calculations must be auditable.

Store:

- input values
- calculated values
- calculation timestamp
- source file
- source worksheet
- costing version
- user
- manual overrides

If a user manually overrides CAD consumption, clearly mark:

CAD value: 1.60 m
Manual override: 1.65 m

and use 1.65 m in the calculation.

==================================================
24. MANUAL OVERRIDES
==================================================

Users must be able to override automatically extracted values when necessary.

Examples:

CAD Consumption
Fabric Rate
CMT Rate
Trim Rate
Quantity
GST
Transport
Overhead

But every override must be clearly identified.

Example:

[CAD] 1.60 m
[Override] 1.65 m

The system should never hide the original value.

==================================================
25. EXPORT
==================================================

Allow the user to export the costing.

At minimum:

- PDF
- Excel

The exported costing should have a professional format.

Include:

Company
Customer
Brand
Style
Category
Style image
CAD summary
Costing type
Detailed costing
Subtotals
Total cost
Cost per piece
Comparison where applicable
Timestamp
Version

==================================================
26. RESPONSIVENESS
==================================================

The system is primarily intended for desktop use because costing tables are information-heavy.

However, it should still be responsive.

Prioritize:

1920×1080
1440×900
1366×768

==================================================
27. PERFORMANCE
==================================================

The application should be able to handle:

- hundreds/thousands of styles
- many costing components
- multiple customers
- multiple brands
- large Excel imports
- repeated CAD uploads

Do not parse large Excel/PDF files on every UI render.

Cache/normalize imported data.

==================================================
28. IMPORTANT BUSINESS RULE
==================================================

Do NOT assume:

Client Cost = Actual Cost + fixed percentage.

The discrepancy between the two is data-driven.

Actual costing represents the company's real production economics.

Client costing represents the commercial costing/price presented to the customer.

The engine must show both independently and explain the difference numerically.

==================================================
29. INITIAL DATA
==================================================

Use the attached files to build the initial imported dataset.

Do not create fake demo styles if real styles exist in the attached files.

Use the actual styles/components from the files for the initial application.

The supplied CAD should be used as the first test case.

For the first working test case, validate that the CAD parser correctly identifies the available information from the supplied CAD PDF, including:

Style #72232
Length 3.87 m
Width 53 inch
Efficiency 68.47%
Length per Set 0.77 m
Surface/Pieces Count 10
Total Length 152.54 m
Total Pieces 10

If any value is ambiguous, flag it rather than inventing an interpretation.

==================================================
30. TESTING
==================================================

Create automated tests for the costing engine.

At minimum test:

- Excel import
- Actual costing calculation
- Client costing calculation
- CAD extraction
- Style matching
- Quantity × rate calculations
- GST
- Total cost
- Cost per PC
- Profit
- Value loss
- Finance cost
- Transport
- Final PO price
- Actual vs Client comparison
- Missing data validation
- Manual override behavior

Create test fixtures from the supplied source files.

Where possible, calculate expected values from the original spreadsheets and compare the application's results.

==================================================
31. DEVELOPMENT APPROACH
==================================================

DO NOT try to build the entire application blindly in one pass.

Follow this sequence:

PHASE 1
Inspect all 3 files thoroughly.

PHASE 2
Create a written data model and mapping of:

Excel field
→ normalized field
→ application field
→ calculation

PHASE 3
Build the import/parsing layer.

PHASE 4
Build the calculation engine.

PHASE 5
Build the CAD extraction layer.

PHASE 6
Build the database/schema.

PHASE 7
Build the UI.

PHASE 8
Connect the UI to the calculation engine.

PHASE 9
Implement comparison.

PHASE 10
Implement export/versioning/audit.

PHASE 11
Test everything against the supplied files.

==================================================
32. CRITICAL DEVELOPMENT RULES
==================================================

1. Never delete source information.
2. Never silently change a source value.
3. Never invent a costing rule.
4. Never assume two differently named fields mean the same thing without validating them.
5. Never hardcode style-specific costing values.
6. Never hardcode customer/brand mappings.
7. Never scatter business calculations throughout UI components.
8. Never rely on browser localStorage as the primary database.
9. Never silently ignore missing values.
10. Never overwrite historical costing versions.
11. Preserve source terminology.
12. Keep Actual and Client costing logically independent.
13. Make the system modular enough to add new costing categories later.
14. Make the CAD parser extensible for different CAD layouts.
15. Make the Excel parser extensible for future costing files.

==================================================
33. DELIVERABLE
==================================================

Build the actual working application in the current repository.

Do not just provide an architecture document.

Start by inspecting the attached files and repository.

Then implement the application.

At the end provide:

1. What was built
2. Project structure
3. How the costing engine works
4. How Actual vs Client costing is separated
5. How CAD extraction works
6. How Excel data is normalized
7. Database schema
8. How to run the application
9. How to import new costing files
10. Known limitations/ambiguities
11. Test results

Most importantly:

The finished product should feel like a serious internal enterprise costing system for a professional garment manufacturer, not a prototype or a spreadsheet wrapper.

Accuracy of the costing logic is more important than visual effects.
The UI should nevertheless have a premium, modern, polished appearance.
