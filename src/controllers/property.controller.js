const Property = require("../models/Property");
const Unit = require("../models/Unit");
const ApiError = require("../utils/ApiError");
const { getPropertyStats } = require("../services/property.service");
const { logActivity } = require("../services/activityLog.service");

// ─── POST /api/properties ─────────────────────────────────────────────────────
const createProperty = async (req, res) => {
  const {
    name,
    propertyType,
    address,
    city,
    state,
    country,
    description,
    amenities,
  } = req.body;

  const property = await Property.create({
    owner: req.user.id,
    name,
    propertyType,
    address,
    city,
    state,
    country: country || "Nigeria",
    description: description || null,
    amenities: amenities || [],
  });

  await logActivity({
    actor: req.user.id,
    action: "PROPERTY_CREATED",
    entity: "Property",
    entityId: property._id,
    meta: { name: property.name, propertyType: property.propertyType },
  });

  res.status(201).json({
    success: true,
    message: "Property created successfully",
    data: property,
  });
};

// ─── GET /api/properties ──────────────────────────────────────────────────────
const getProperties = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    state,
    propertyType,
    status = "Active",
  } = req.query;

  const filter = { owner: req.user.id };

  // Status filter — landlord can pass 'all' to see everything including archived
  if (status !== "all") filter.status = status;

  // Search by name, city, or state
  if (search) {
    filter.$text = { $search: search };
  }

  if (state) filter.state = new RegExp(state, "i");
  if (propertyType) filter.propertyType = propertyType;

  const skip = (Number(page) - 1) * Number(limit);

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Property.countDocuments(filter),
  ]);

  // Attach live unit stats to each property
  const data = await Promise.all(
    properties.map(async (p) => {
      const stats = await getPropertyStats(p._id);
      return { ...p.toObject(), stats };
    }),
  );

  res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
};

// ─── GET /api/properties/:id ──────────────────────────────────────────────────
const getPropertyById = async (req, res) => {
  const property = await Property.findOne({
    _id: req.params.id,
    owner: req.user.id, // landlord A cannot access landlord B's property
  });

  if (!property) throw new ApiError(404, "Property not found");

  const stats = await getPropertyStats(property._id);

  res.status(200).json({
    success: true,
    data: { ...property.toObject(), stats },
  });
};

// ─── PUT /api/properties/:id ──────────────────────────────────────────────────
const updateProperty = async (req, res) => {
  // Strip owner from body — owner can never be changed
  const { owner, ...updates } = req.body;

  const property = await Property.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!property) throw new ApiError(404, "Property not found");

  if (updates.status === "Archived") {
    throw new ApiError(
      400,
      "To archive a property use DELETE /api/properties/:id",
    );
  }

  Object.assign(property, updates);
  await property.save();

  await logActivity({
    actor: req.user.id,
    action: "PROPERTY_UPDATED",
    entity: "Property",
    entityId: property._id,
    meta: { updates },
  });

  res.status(200).json({
    success: true,
    message: "Property updated successfully",
    data: property,
  });
};

// ─── DELETE /api/properties/:id ───────────────────────────────────────────────
// Soft delete only — sets status to Archived
const archiveProperty = async (req, res) => {
  const property = await Property.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!property) throw new ApiError(404, "Property not found");

  if (property.status === "Archived") {
    throw new ApiError(400, "Property is already archived");
  }

  // Check for active occupied units before archiving
  const occupiedUnits = await Unit.countDocuments({
    property: property._id,
    status: "Occupied",
    isArchived: false,
  });

  if (occupiedUnits > 0) {
    throw new ApiError(
      400,
      `Cannot archive property with ${occupiedUnits} occupied unit(s). Vacate all tenants first.`,
    );
  }

  property.status = "Archived";
  await property.save();

  await logActivity({
    actor: req.user.id,
    action: "PROPERTY_ARCHIVED",
    entity: "Property",
    entityId: property._id,
    meta: { name: property.name },
  });

  res.status(200).json({
    success: true,
    message: "Property archived successfully",
  });
};

module.exports = {
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  archiveProperty,
};
