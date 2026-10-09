# Public REST API Automation Test Plan

## Application Overview

Comprehensive, automation-ready coverage of every public endpoint documented at https://restful-api.dev/: GET /objects, GET /objects/{id}, POST /objects, PUT /objects/{id}, PATCH /objects/{id}, and DELETE /objects/{id}. Tests use the public base URL https://api.restful-api.dev, require no authentication, and use dynamically created objects with cleanup for mutation tests. Assertions follow the published contract; exact failure status codes are not prescribed by the documentation and should not be hard-coded unless the live API contract specifies them.

## Test Scenarios

### 1. GET /objects - list and filter objects

**Seed:** `tests/seed.spec.ts`

#### 1.1. List the predefined public objects

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. From a clean test run, send GET https://api.restful-api.dev/objects without query parameters.
    - expect: The request succeeds with a 2xx response and a JSON array body.
    - expect: Each returned item has an id and name; data is either null or a JSON value, as the documentation's samples demonstrate.
    - expect: The response includes documented sample records such as id "1" (Google Pixel 6 Pro) and id "7" (Apple MacBook Pro 16), without asserting an unstable total count or ordering.
  2. Repeat the GET request and compare the documented sample IDs and resource structure.
    - expect: The endpoint remains publicly accessible without credentials.
    - expect: Sample records are returned consistently; do not assert that records created by other users appear in this reserved predefined list.

#### 1.2. Filter list by one object ID

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. Send GET /objects?id=7 using the documented example ID.
    - expect: A 2xx response returns a JSON array containing only the requested matching object(s).
    - expect: The result contains id "7" and its name and data fields; it excludes other IDs.

#### 1.3. Filter list by repeated ID query parameters

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. Send GET /objects?id=3&id=5&id=10.
    - expect: A 2xx response returns a JSON array containing only requested matching IDs.
    - expect: Each requested available ID appears no more than once; records outside the requested set are absent.
    - expect: The test does not rely on response order unless the API contract explicitly guarantees it.

#### 1.4. Handle unknown and mixed requested IDs

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. Send GET /objects?id=<unknown-id> and then GET /objects?id=1&id=<unknown-id>.
    - expect: Both responses follow the collection endpoint's documented array response shape.
    - expect: Unknown IDs do not cause unrelated records to be returned; the mixed request returns only known requested records.
    - expect: Do not assert a specific status code or error shape for an unknown query ID because the documentation does not define one.

#### 1.5. Handle empty, duplicated, and encoded ID query values

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. Exercise /objects with an empty id value, duplicate id values, and a URL-encoded ID value, keeping each request separate.
    - expect: Each response is valid JSON and follows the documented list-or-error behavior without a server error.
    - expect: Duplicate and encoded values are parsed safely; returned IDs, if any, correspond only to valid requested IDs.
    - expect: Record actual behavior for empty values rather than imposing an undocumented interpretation.

### 2. GET /objects/{id} - retrieve one object

**Seed:** `tests/seed.spec.ts`

#### 2.1. Retrieve a documented sample object

**File:** `tests/public-api/get-object-by-id.spec.ts`

**Steps:**
  1. Send GET https://api.restful-api.dev/objects/7 without authentication.
    - expect: The response succeeds with a 2xx status and a JSON object.
    - expect: The body contains id "7", name "Apple MacBook Pro 16", and data matching the documented example fields (year, price, CPU model, and Hard disk size).

#### 2.2. Retrieve an object with null data

**File:** `tests/public-api/get-object-by-id.spec.ts`

**Steps:**
  1. Send GET /objects/2, which is shown in the list response example with data set to null.
    - expect: The response succeeds with a 2xx status and a JSON object with id "2" and the documented name.
    - expect: The data property is present and null; it is not omitted or converted to an empty object.

#### 2.3. Return a not-found response for a nonexistent ID

**File:** `tests/public-api/get-object-by-id.spec.ts`

**Steps:**
  1. Send GET /objects/<unique-nonexistent-id> using a value that cannot collide with the fixed documented IDs or objects created by this test run.
    - expect: The API does not return a successful representation of a different object.
    - expect: The response indicates not found or otherwise reports a non-successful outcome consistent with the live API contract; do not hard-code an undocumented status or error body.

#### 2.4. Handle malformed path IDs safely

**File:** `tests/public-api/get-object-by-id.spec.ts`

**Steps:**
  1. Send requests with an empty path segment where routable and with URL-encoded reserved characters as the ID.
    - expect: Requests are handled as valid routing/not-found responses or documented client errors, not an unhandled server failure.
    - expect: No unrelated object is returned.

### 3. POST /objects - create objects

**Seed:** `tests/seed.spec.ts`

#### 3.1. Create an object with nested data

**File:** `tests/public-api/post-objects.spec.ts`

**Steps:**
  1. POST /objects with Content-Type: application/json and a unique name plus the documented example data fields; parse and retain the returned id.
    - expect: The response succeeds and returns a JSON object with a non-empty id, the submitted name, and data deeply matching the submitted JSON values and types.
    - expect: A createdAt timestamp is present and parseable as an ISO-8601 date-time.
    - expect: GET /objects/{returned-id} retrieves the created object with the same submitted values.
    - expect: Delete the created object in a finally/cleanup step.

#### 3.2. Create objects with supported flexible data shapes

**File:** `tests/public-api/post-objects.spec.ts`

**Steps:**
  1. Create separate objects whose data values are (a) a nested object containing strings, numbers, booleans, null, arrays and nested objects, (b) an array, (c) null, and (d) a scalar JSON value if accepted by the documented arbitrary-JSON contract.
    - expect: For accepted valid JSON data shapes, the response and subsequent GET preserve the submitted JSON structure and value types.
    - expect: For a shape rejected by the implementation, capture the explicit client error; do not silently accept a mismatched or coerced value.
    - expect: Clean up every successfully created object even if an assertion fails.

#### 3.3. Reject malformed or incomplete create requests

**File:** `tests/public-api/post-objects.spec.ts`

**Steps:**
  1. Independently POST invalid JSON, an empty body, a missing name, a missing data field, and an unsupported Content-Type.
    - expect: Invalid requests do not produce a success-shaped object with an unusable ID.
    - expect: The API returns an explicit client failure for rejected input; the exact status and validation message are not fixed by the documentation.
    - expect: A follow-up list/filter or known-ID check confirms no unintended test object was created.

#### 3.4. Create with boundary and escaped content

**File:** `tests/public-api/post-objects.spec.ts`

**Steps:**
  1. POST an object with a name containing Unicode, quotes, and escaped characters, plus data containing empty strings, zero, false, and special-character keys.
    - expect: The request succeeds when values are valid JSON and the response round-trips the values without corruption or unwanted trimming.
    - expect: The returned ID and createdAt are valid; clean up the object.

### 4. PUT /objects/{id} - replace object data

**Seed:** `tests/seed.spec.ts`

#### 4.1. Replace a created object's name and data

**File:** `tests/public-api/put-object.spec.ts`

**Steps:**
  1. Create a uniquely named fixture through POST /objects and retain its ID. PUT /objects/{id} with Content-Type: application/json and a different name and data object containing both changed and new fields.
    - expect: The PUT succeeds and returns the same ID, the submitted name, the complete submitted data, and a parseable updatedAt timestamp.
    - expect: A subsequent GET confirms persisted values.
    - expect: Fields that existed only in the prior data are absent after PUT, confirming full replacement rather than PATCH-style merge.
    - expect: Delete the fixture in cleanup.

#### 4.2. Validate PUT request requirements

**File:** `tests/public-api/put-object.spec.ts`

**Steps:**
  1. Using a disposable object created for this test, send PUT requests with malformed JSON, missing name, missing data, empty body, and wrong Content-Type; do not reuse the fixture after a rejected operation without checking it.
    - expect: Rejected payloads return an explicit client failure and do not report a successful update with incorrect values.
    - expect: A subsequent GET confirms the object remains unchanged after rejected updates.
    - expect: Clean up the fixture regardless of the result.

#### 4.3. Update a nonexistent ID

**File:** `tests/public-api/put-object.spec.ts`

**Steps:**
  1. Send PUT /objects/<unique-nonexistent-id> with a valid JSON name and data payload.
    - expect: The API does not silently claim a successful update of an unrelated resource.
    - expect: The response indicates a not-found/client failure or the live API's documented behavior; avoid assuming whether PUT creates absent resources unless verified by contract.

### 5. PATCH /objects/{id} - partially update object

**Seed:** `tests/seed.spec.ts`

#### 5.1. Change only the supplied name field

**File:** `tests/public-api/patch-object.spec.ts`

**Steps:**
  1. Create a unique object with multiple data fields. PATCH /objects/{id} with Content-Type: application/json and only a new name, as in the documentation example.
    - expect: The response succeeds with the same ID, updated name, unchanged data, and a parseable updatedAt timestamp.
    - expect: A follow-up GET confirms omitted fields and data are preserved.
    - expect: Delete the fixture in cleanup.

#### 5.2. Partially update data while preserving other fields

**File:** `tests/public-api/patch-object.spec.ts`

**Steps:**
  1. Create a fixture with several data properties, then PATCH with a body that changes one data property and adds another, using the API's documented JSON structure.
    - expect: The updated values are persisted and fields not included in the patch remain unchanged, consistent with partial-update semantics.
    - expect: The response identifies the same object and includes updatedAt.
    - expect: Clean up the fixture.

#### 5.3. Handle empty, malformed, and incomplete PATCH bodies

**File:** `tests/public-api/patch-object.spec.ts`

**Steps:**
  1. Against a disposable fixture, try an empty JSON object, malformed JSON, missing Content-Type, and an invalid body; read the object before and after each request.
    - expect: The API either accepts a valid no-op body without damaging the resource or explicitly rejects it; malformed input is not reported as a successful unintended change.
    - expect: After rejected requests, the object remains unchanged.
    - expect: Clean up the fixture.

#### 5.4. Patch a nonexistent ID

**File:** `tests/public-api/patch-object.spec.ts`

**Steps:**
  1. Send PATCH /objects/<unique-nonexistent-id> with a valid partial JSON update.
    - expect: No unrelated object is modified or returned as the target.
    - expect: The result is a not-found/client failure or other explicitly documented live behavior, without hard-coding an unspecified status.

### 6. DELETE /objects/{id} - delete objects

**Seed:** `tests/seed.spec.ts`

#### 6.1. Delete a created object and verify absence

**File:** `tests/public-api/delete-object.spec.ts`

**Steps:**
  1. Create a unique object, retain its ID, and send DELETE /objects/{id}.
    - expect: The response succeeds and returns a JSON message identifying the deleted ID, matching the documented message form.
    - expect: A subsequent GET for the ID no longer returns the deleted object's successful representation.
    - expect: A repeated DELETE is handled as a not-found/client outcome or the live API's defined idempotent behavior; do not require an undocumented exact response.
    - expect: Use cleanup protection so a failed assertion does not leave test data behind.

#### 6.2. Delete a nonexistent ID

**File:** `tests/public-api/delete-object.spec.ts`

**Steps:**
  1. Send DELETE /objects/<unique-nonexistent-id>.
    - expect: The API does not claim that a different object was deleted.
    - expect: The API returns the live contract's explicit not-found/client behavior; status and message are not fixed beyond the documented successful deletion example.

#### 6.3. Delete a documented sample object only in an isolated disposable environment

**File:** `tests/public-api/delete-object.spec.ts`

**Steps:**
  1. If the API provides a dedicated isolated test environment, delete a sample ID there and verify it is absent; otherwise skip this destructive shared-data case and use only a POST-created fixture.
    - expect: No shared predefined sample record is permanently removed during ordinary automation.
    - expect: If run against an explicitly disposable environment, deletion is verified through a follow-up GET.

### 7. Cross-cutting public API contract

**Seed:** `tests/seed.spec.ts`

#### 7.1. Verify HTTPS and unauthenticated access for every route

**File:** `tests/public-api/api-contract.spec.ts`

**Steps:**
  1. Call each of the six documented public routes using https://api.restful-api.dev and omit authentication headers/cookies.
    - expect: All routes are served over HTTPS and can be reached without credentials.
    - expect: Successful calls return JSON bodies in the documented shape; no route unexpectedly requires authentication.

#### 7.2. Verify JSON response headers and valid JSON

**File:** `tests/public-api/api-contract.spec.ts`

**Steps:**
  1. For representative success cases from GET list, GET by ID, POST, PUT, PATCH, and DELETE, inspect response headers and parse response bodies.
    - expect: Responses with JSON bodies advertise an appropriate JSON Content-Type and contain syntactically valid JSON.
    - expect: Object/list/error message shapes are consistent with each endpoint's documented contract; do not attempt to JSON-parse an empty body if the live contract legitimately returns one.

#### 7.3. Verify advertised cross-origin access

**File:** `tests/public-api/api-contract.spec.ts`

**Steps:**
  1. Send a browser-style CORS preflight OPTIONS request for a public GET and a JSON POST, including Origin, Access-Control-Request-Method, and relevant request headers.
    - expect: The API permits cross-origin access as advertised in the documentation.
    - expect: The preflight response exposes appropriate allow-origin, allow-methods, and allow-headers values for the requested origin and operation.

#### 7.4. Verify content type and method handling

**File:** `tests/public-api/api-contract.spec.ts`

**Steps:**
  1. Send an unsupported HTTP method to /objects and malformed JSON to one mutation endpoint without altering any existing sample object.
    - expect: Unsupported methods and invalid request bodies are handled as explicit client errors rather than returning a false successful CRUD result.
    - expect: No unrelated or predefined resource changes as a result of the negative tests.
