const now = Date.now();
const day = 86_400_000;

function iso(daysAgo) {
  return new Date(now - daysAgo * day).toISOString();
}

export const organizationName = "Northwind Operations";

export const profile = {
  user_id: "usr_mira",
  organization_id: "org_northwind",
  organization_name: organizationName,
  auth_user_id: "auth_mira",
  email: "mira@northwind.example",
  name: "Mira Mitra",
  avatar_url: null,
  job_title: "Operations lead",
  role: "owner",
  language_preference: "en"
};

export const team = {
  organization_id: "org_northwind",
  organization_name: organizationName,
  members: [
    {
      user_id: "usr_mira",
      email: "mira@northwind.example",
      name: "Mira Mitra",
      job_title: "Operations lead",
      role: "owner"
    },
    {
      user_id: "usr_alex",
      email: "alex@northwind.example",
      name: "Alex Chen",
      job_title: "Legal counsel",
      role: "member"
    }
  ]
};

export const invitations = [];

const docNames = [
  ["Vendor Agreement - Northwind.docx", "docx", "ready", 41, 2],
  ["Insurance Renewal 2026.pdf", "pdf", "processing", 0, 0],
  ["Warehouse SOP v3.pdf", "pdf", "failed", 0, 1],
  ["Safety Audit Q3.pdf", "pdf", "ready", 76, 5],
  ["Master Services Agreement.pdf", "pdf", "ready", 92, 8],
  ["Employee Handbook 2026.docx", "docx", "ready", 128, 12],
  ["Legacy lease scans (4).pdf", "pdf", "failed", 0, 3],
  ["Procurement Policy.pdf", "pdf", "ready", 54, 6],
  ["Data Processing Addendum.docx", "docx", "ready", 33, 4],
  ["Facilities Runbook.pdf", "pdf", "ready", 61, 7],
  ["Benefits Summary 2026.pdf", "pdf", "ready", 28, 9],
  ["Contractor NDA Template.docx", "docx", "ready", 19, 10]
];

export const documents = docNames.map(([filename, file_type, status, chunks, ageDays], index) => ({
  document_id: `doc_${index + 1}`,
  filename,
  file_type,
  status: status === "processing" ? "processing" : status,
  storage_path: `org/doc_${index + 1}`,
  chunks_count: chunks,
  error_message:
    status === "failed" && filename.includes("Warehouse")
      ? "PDF is password protected."
      : status === "failed"
        ? "No extractable text."
        : null,
  created_at: iso(ageDays),
  updated_at: iso(Math.max(0, ageDays - 1))
}));

// Pad document count metadata via list length; UI shows actual list length in table
while (documents.length < 12) {
  /* keep sample set small for screenshot clarity */
}

export const conversations = {
  conversations: [
    {
      id: "conv_vendor",
      title: "Vendor termination notice period",
      created_at: iso(0),
      updated_at: iso(0),
      message_count: 4
    },
    {
      id: "conv_indemnity",
      title: "Indemnity cap vs. insurance renewal",
      created_at: iso(1),
      updated_at: iso(1),
      message_count: 6
    },
    {
      id: "conv_renewal",
      title: "Renewal dates in the next 90 days",
      created_at: iso(3),
      updated_at: iso(2),
      message_count: 3
    }
  ]
};

const noticeSnippet =
  "Either party may terminate this Agreement upon sixty (60) days' written notice to the other party.";

export const conversationVendor = {
  conversation: {
    id: "conv_vendor",
    title: "Vendor termination notice period",
    created_at: iso(1),
    updated_at: iso(0),
    messages: [
      {
        id: "msg_u1",
        role: "user",
        content: "What's the notice period in the vendor agreement?",
        citations: [],
        created_at: iso(0)
      },
      {
        id: "msg_a1",
        role: "assistant",
        content:
          "The vendor agreement requires 60 days' written notice before termination. Either party may end the agreement by giving the other party written notice at least sixty (60) days in advance.",
        citations: [
          {
            document_id: "doc_1",
            chunk_index: 41,
            chunk_id: "chunk_41",
            filename: "Vendor Agreement - Northwind.docx",
            page_number: 4,
            snippet: noticeSnippet,
            score: 0.98
          },
          {
            document_id: "doc_1",
            chunk_index: 42,
            chunk_id: "chunk_42",
            filename: "Vendor Agreement - Northwind.docx",
            page_number: 4,
            snippet:
              "7.3 Termination for convenience. Either party may terminate upon sixty (60) days' written notice.",
            score: 0.91
          }
        ],
        created_at: iso(0)
      }
    ]
  }
};

function isApiRequest(urlString) {
  try {
    const url = new URL(urlString);
    return (
      url.port === "8000" ||
      url.hostname.includes("onrender.com") ||
      url.hostname === "127.0.0.1" && url.pathname.startsWith("/users")
    );
  } catch {
    return false;
  }
}

export async function installRoutes(page) {
  const fulfill = (route, body) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body)
    });

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET" || !isApiRequest(request.url())) {
      return route.continue();
    }

    const path = new URL(request.url()).pathname;

    if (path.endsWith("/documents")) {
      return fulfill(route, documents);
    }
    if (/\/conversations\/[^/]+$/.test(path)) {
      return fulfill(route, conversationVendor);
    }
    if (path.endsWith("/conversations")) {
      return fulfill(route, conversations);
    }
    if (path.endsWith("/users/me")) {
      return fulfill(route, profile);
    }
    if (path.endsWith("/users/team")) {
      return fulfill(route, team);
    }
    if (path.endsWith("/users/invitations")) {
      return fulfill(route, invitations);
    }

    return route.continue();
  });
}
