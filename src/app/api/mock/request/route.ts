import { ResponseType } from "@/lib/types/apiResponse";
import { NextResponse } from "next/server";
import clientPromise from "../config/db";
import { PAGINATION_PAGE_SIZE } from "@/lib/constants/config";


import {
  createNewMockRequest,
  editMockStatusRequest,
  getMockItemRequests,
} from "@/server/mock/requests";
import { ServerResponseBuilder } from "@/lib/builders/serverResponseBuilder";
import { InputException } from "@/lib/errors/inputExceptions";
import { config } from "process";





export async function PATCH(request: Request) {
  try {
    const req = await request.json();
    const editedRequest = editMockStatusRequest(req);
    return new Response(JSON.stringify(editedRequest), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof InputException) {
      return new ServerResponseBuilder(ResponseType.INVALID_INPUT).build();
    }
    return new ServerResponseBuilder(ResponseType.UNKNOWN_ERROR).build();
  }
}


type RequestStatus = "pending" | "completed" | "approved" | "rejected";

type ItemRequest = {
  id: string;
  requestorName: string;
  itemRequested: string;
  createdDate: Date;
  lastEditedDate?: Date;
  status: RequestStatus;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function PUT(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "Request body cannot be empty" },
      { status: 400 }
    );
  }

  const { requestorName, itemRequested } = body as {
    requestorName?: unknown;
    itemRequested?: unknown;
  };

  if (!isNonEmptyString(requestorName)) {
    return NextResponse.json(
      { error: "requestorName must be a non-empty string" },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(itemRequested)) {
    return NextResponse.json(
      { error: "itemRequested must be a non-empty string" },
      { status: 400 }
    );
  }

  if (requestorName.length < 3 || requestorName.length > 30) {
    return NextResponse.json(
      { error: "requestorName must be between 3 and 30 characters" },
      { status: 400 }
    );
  }

  if (itemRequested.length < 2 || itemRequested.length > 100) {
    return NextResponse.json(
      { error: "itemRequested must be between 2 and 100 characters" },
      { status: 400 }
    );
  }

  const now = new Date();

  const newRequest: ItemRequest = {
    id: crypto.randomUUID(),
    requestorName: requestorName.trim(),
    itemRequested: itemRequested.trim(),
    createdDate: now,
    lastEditedDate: now,
    status: "pending",
  };

  const client = await clientPromise;
  const db = client.db("requests"); 

  await db.collection<ItemRequest>("requests").insertOne(newRequest);

  return NextResponse.json(newRequest, { status: 201 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const rawPage = url.searchParams.get("page");
  const page = rawPage ? Number.parseInt(rawPage, 10) : 1;

  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json(
      { error: "page must be a positive integer (>= 1)" },
      { status: 400 }
    );
  }

  const skip = (page - 1) * PAGINATION_PAGE_SIZE;
  const limit = PAGINATION_PAGE_SIZE;

  const client = await clientPromise;
  const db = client.db("requests");
  const collection = db.collection<ItemRequest>("requests");

  const [items, total] = await Promise.all([
    collection
      .find({})
      .sort({ createdDate: -1 }) 
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments({}),
  ]);

  return NextResponse.json({
    page,
    pageSize: PAGINATION_PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGINATION_PAGE_SIZE),
    items,
  });
}

