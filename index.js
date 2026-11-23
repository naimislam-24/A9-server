import express from "express";
import cors from "cors";
const PORT = 5000;
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { jwtVerify, createRemoteJWKSet } from "jose";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
// app.use(cors());
app.use(
  cors({
    origin: `${process.env.CLIENT_URL}`,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const db = connectedClient.db("pizzahub");
const usersvendorcollection = db.collection("usersvendor");
const usersordercollection = db.collection("usersorder");
const userscollection = db.collection("user");
const paymentscollection = db.collection("payments");

// const verifyToken = async (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader) {
//     return res.status(401).send({ msg: "Unauthorized!" });
//   }
//   const token = authHeader.split(" ")[1];
//   if (!token) {
//     return res.status(401).send({ msg: "Unauthorized!" });
//   }
//   const JWKS = createRemoteJWKSet(
//     new URL("http://localhost:3000/api/auth/jwks"),
//   );
//   try {
//     const { payload } = await jwtVerify(token, JWKS);
//     // payload ta vinno jaygay use korbo
//     next();
//   } catch (error) {
//     return res.status(500).send({ msg: "Server Error" });
//   }
// };

const JWKS = createRemoteJWKSet(
  new URL(
    process.env.AUTH_JWKS_URL || `${process.env.CLIENT_URL}/api/auth/jwks`,
  ),
);
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized! Token missing.",
    });
  }
  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    // Verified user information
    req.user = payload;
    next();
  } catch (error) {
    console.log("Token Verification Error:", error);
    return res.status(401).send({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// app.post("/usersvendor", verifyToken, async (req, res) => {
//   try {
//     const menuData = req.body;
//     const newMenuItem = {
//       ...menuData,
//       approvalStatus: "Pending",
//       createdAt: new Date(),
//     };
//     const result = await usersvendorcollection.insertOne(newMenuItem);
//     res.status(201).send({
//       success: true,
//       message: "Menu item submitted for admin approval",
//       insertedId: result.insertedId,
//       approvalStatus: newMenuItem.approvalStatus,
//     });
//   } catch (error) {
//     res.status(500).send({
//       success: false,
//       message: error.message,
//     });
//   }
// });

app.post("/usersvendor", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(401).send({
        success: false,
        message: "Email not found in authentication token",
      });
    }
    const vendor = await userscollection.findOne({
      email,
      role: "vendor",
    });
    if (!vendor) {
      return res.status(404).send({
        success: false,
        message: "Vendor not found",
      });
    }
    // Premium via Stripe sets `premium`; /subscription/upgrade sets
    // `subscription.plan`. Accept either so paying once sticks.
    const isPremium =
      vendor.premium === true || vendor.subscription?.plan === "premium";
    // Count Pending + Approved items
    const totalItems = await usersvendorcollection.countDocuments({
      email,
      approvalStatus: {
        $in: ["Pending", "Approved"],
      },
    });
    // Free plan maximum 3 items
    if (!isPremium && totalItems >= 3) {
      return res.status(403).send({
        success: false,
        limitReached: true,
        message:
          "Your Free plan allows only 3 menu items. Please upgrade to Premium!",
      });
    }
    const { itemName, category, description, price, location, imageUrl } =
      req.body;
    if (
      !itemName ||
      !category ||
      !description ||
      !location ||
      !imageUrl ||
      !Number.isFinite(Number(price)) ||
      Number(price) <= 0
    ) {
      return res.status(400).send({
        success: false,
        message: "Please provide valid menu item information",
      });
    }
    const newMenuItem = {
      itemName,
      category,
      description,
      price: Number(price),
      location,
      imageUrl,
      email,
      approvalStatus: "Pending",
      createdAt: new Date(),
    };
    const result = await usersvendorcollection.insertOne(newMenuItem);
    res.status(201).send({
      success: true,
      message: "Menu item submitted successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.log("Add Menu Error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to add menu item",
    });
  }
});

app.get("/usersvendor", async (req, res) => {
  const result = await usersvendorcollection.find().toArray();
  res.send(result);
});

app.get("/users/:id/premium", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const doc = await userscollection.findOne(query, {
    projection: { premium: 1, "subscription.plan": 1 },
  });
  // The addmenu page reads `data.result.premium`, and a user can be premium
  // via either the Stripe flow (`premium`) or /subscription/upgrade
  // (`subscription.plan`).
  res.send({
    success: true,
    result: {
      premium: doc?.premium === true || doc?.subscription?.plan === "premium",
    },
  });
});

app.get("/subscription/:email", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    if (!email || email !== req.params.email) {
      return res.status(403).send({
        success: false,
        message: "Access denied",
      });
    }
    const vendor = await userscollection.findOne({
      email,
      role: "vendor",
    });
    if (!vendor) {
      return res.status(404).send({
        success: false,
        message: "Vendor not found",
      });
    }
    const activeItems = await usersvendorcollection.countDocuments({
      email,
      approvalStatus: {
        $in: ["Pending", "Approved"],
      },
    });
    // Premium via Stripe sets `premium`; /subscription/upgrade sets
    // `subscription.plan`. Report premium if either is set, otherwise the
    // subscription page shows "Upgrade to Premium" again after paying.
    const isPremium =
      vendor.premium === true || vendor.subscription?.plan === "premium";
    res.send({
      success: true,
      plan: isPremium ? "premium" : "free",
      status: vendor.subscription?.status || "active",
      activeItems,
    });
  } catch (error) {
    console.log("Get Subscription Error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to fetch subscription",
    });
  }
});

app.patch("/subscription/upgrade", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    if (!email) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized user",
      });
    }
    const vendor = await userscollection.findOne({
      email,
      role: "vendor",
    });
    if (!vendor) {
      return res.status(404).send({
        success: false,
        message: "Vendor not found",
      });
    }
    if (vendor.subscription?.plan === "premium") {
      return res.send({
        success: true,
        message: "Already a Premium member!",
      });
    }
    await userscollection.updateOne(
      {
        email,
        role: "vendor",
      },
      {
        $set: {
          "subscription.plan": "premium",
          "subscription.status": "active",
          "subscription.updatedAt": new Date(),
        },
      },
    );
    res.send({
      success: true,
      message: "Premium plan activated successfully!",
    });
  } catch (error) {
    console.log("Upgrade Error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to upgrade subscription",
    });
  }
});

app.get("/usersvendor/count/:email", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    if (!email || email !== req.params.email) {
      return res.status(403).send({
        success: false,
        message: "Access denied",
      });
    }
    const count = await usersvendorcollection.countDocuments({
      email,
      approvalStatus: {
        $in: ["Pending", "Approved"],
      },
    });
    res.send({
      success: true,
      count,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch count",
    });
  }
});

// ********************************************************

app.patch("/usersvendor/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const result = await usersvendorcollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update product",
      error: error.message,
    });
  }
});

app.delete("/usersvendor/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await usersvendorcollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Menu item not found",
      });
    }
    res.send({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete menu item",
      error: error.message,
    });
  }
});

app.get("/usersvendor/featured/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await usersvendorcollection.find({ email: email }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch menu items" });
  }
});

// ******************************************
app.post("/orders", verifyToken, async (req, res) => {
  try {
    const menuData = req.body;
    if (
      !menuData.productId ||
      !menuData.itemName ||
      !menuData.deliveryDate ||
      !menuData.deliveryAddress
    ) {
      return res.status(400).send({
        message: "Required fields are missing",
      });
    }
    const result = await usersordercollection.insertOne(menuData);
    res.status(201).send({
      success: true,
      message: "Order placed successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to place order",
    });
  }
});

// Get All Orders
app.get("/orders", verifyToken, async (req, res) => {
  try {
    const result = await usersordercollection.find().toArray();
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch orders",
    });
  }
});

// user delete card
app.delete("/orders/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid order ID",
      });
    }
    const result = await usersordercollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Order not found",
      });
    }
    res.status(200).send({
      message: "Order deleted successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete order",
    });
  }
});

app.get("/orders/:productId", verifyToken, async (req, res) => {
  try {
    const productId = req.params.productId;
    const result = await usersordercollection
      .find({ productId: productId })
      .toArray();
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch orders",
    });
  }
});

// Get Only Approved Menu Items
app.get("/usersvendor/approved", async (req, res) => {
  try {
    const result = await usersvendorcollection
      .find({ approvalStatus: "Approved" })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch approved menu items",
    });
  }
});

// Get All Users
app.get("/users", verifyToken, async (req, res) => {
  try {
    const result = await userscollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch users",
    });
  }
});

// Block / Unblock User
app.patch("/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;
    const result = await userscollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { isBlocked },
      },
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user",
    });
  }
});

// Payments Api
app.post("/payments/checkout-verify", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).send({
        success: false,
        message: "sessionId is required",
      });
    }
    const { status, payment_status, customer_email, metadata, payment_intent } =
      await stripe.checkout.sessions.retrieve(sessionId);
    if (status === "complete" && payment_status === "paid") {
      const sessionQuery = { sessionId };
      const existingPayment = await paymentscollection.findOne(sessionQuery);
      if (existingPayment) {
        // Payment row already exists, but make sure the premium flags are
        // still set (self-heal if an earlier run inserted the row and then
        // crashed before updating the user).
        if (metadata?.userId) {
          await userscollection.updateOne(
            { email: metadata.userId },
            { $set: { premium: true, "subscription.plan": "premium" } },
          );
        }
        return res.send({
          success: true,
          message: "Payment already verified",
        });
      }
      const paymentData = {
        sessionId,
        status,
        payment_status,
        customer_email,
        userId: metadata?.userId,
        payment_date: new Date(),
        payment_intent,
      };
      const result = await paymentscollection.insertOne(paymentData);
      // Set both premium flags: `premium` (addmenu badge) and
      // `subscription.plan` (subscription page + free-plan item limit).
      const updateResult = metadata?.userId
        ? await userscollection.updateOne(
            { email: metadata.userId },
            {
              $set: { premium: true, "subscription.plan": "premium" },
            },
          )
        : { matchedCount: 0 };
      return res.send({
        success: true,
        result,
        updateResult,
      });
    }
    return res.status(400).send({
      success: false,
      message: "Payment verification failed",
    });
  } catch (error) {
    console.error("Checkout verify error:", error);
    return res.status(500).send({
      success: false,
      message: error instanceof Error ? error.message : "Verification failed",
    });
  }
});
// app.post("/payments/checkout-verify", async (req, res) => {
//   try {
//     const { sessionId } = req.body;
//     if (!sessionId) {
//       return res
//         .status(400)
//         .send({ success: false, message: "sessionId is required" });
//     }
//     const { status, payment_status, customer_email, metadata, payment_intent } =
//       await stripe.checkout.sessions.retrieve(sessionId);
//     if (status === "complete" && payment_status === "paid") {
//       const sessionQuery = { sessionId };
//       const existingPayment = await payment.findOne(sessionQuery);
//       if (existingPayment) {
//         return res.send({
//           success: false,
//           message: "Payment already verified",
//         });
//       }

//       const payment = {
//         sessionId,
//         status,
//         payment_status,
//         customer_email,
//         userId: metadata?.userId,
//         payment_date: new Date(),
//         payment_intent,
//       };
//       const result = await paymentscollection.insertOne(payment);
//       // The client puts the user's email in metadata.userId
//       // (src/app/api/checkout_sessions/route.ts), so match by email.
//       const updateResult = metadata?.userId
//         ? await userscollection.updateOne(
//             { email: metadata.userId },
//             { $set: { premium: true } },
//           )
//         : { matchedCount: 0 };
//       res.send({ success: true, result, updateResult });
//       return;
//     }
//     res.send({ success: false, message: "Payment verification failed" });
//   } catch (error) {
//     console.error("Checkout verify error:", error);
//     res.status(500).send({
//       success: false,
//       message: error instanceof Error ? error.message : "Verification failed",
//     });
//   }
// });

// http://localhost:5000
app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});

export default app;
