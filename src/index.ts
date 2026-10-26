import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import { PrismaClient } from "@prisma/client";
import { swaggerDocument } from "./swagger";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-softclub-key-2026";

const imagesDir = path.join(process.cwd(), "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/images", express.static(imagesDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage });

const sendResponse = <T>(res: Response, data: T, statusCode = 200, errors: string[] = []) => {
  return res.status(statusCode).json({ statusCode, data, errors });
};

const generateToken = (user: { id: string; userName: string; email: string; role: string }) => {
  return jwt.sign(
    {
      sid: user.id,
      name: user.userName,
      email: user.email,
      role: user.role,
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

interface AuthRequest extends Request {
  user?: { sid: string; name: string; role: string };
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return sendResponse(res, null, 401, ["Unauthorized: No token provided"]);

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sid: string; name: string; role: string };
    req.user = decoded;
    next();
  } catch {
    return sendResponse(res, null, 401, ["Unauthorized: Invalid or expired token"]);
  }
};

app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/swagger/v1/swagger.json", (_req, res) => res.json(swaggerDocument));

app.post("/Account/register", async (req, res) => {
  try {
    const { userName, phoneNumber, email, password, confirmPassword } = req.body;
    if (!userName || !email || !password) {
      return sendResponse(res, null, 400, ["Заполните обязательные поля"]);
    }
    if (password !== confirmPassword) {
      return sendResponse(res, null, 400, ["Пароли не совпадают"]);
    }
    const existing = await prisma.user.findFirst({
      where: { OR: [{ userName }, { email }] },
    });
    if (existing) {
      return sendResponse(res, null, 400, ["Пользователь с таким именем или email уже существует"]);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { userName, email, phoneNumber: phoneNumber || "", password: hashedPassword },
    });
    const token = generateToken(user);
    return sendResponse(res, token, 200);
  } catch (e: any) {
    return sendResponse(res, null, 500, [e.message]);
  }
});

app.post("/Account/login", async (req, res) => {
  try {
    const { userName, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { OR: [{ userName }, { email: userName }] },
    });
    if (!user || !user.password) {
      return sendResponse(res, null, 400, ["Неверный логин или пароль"]);
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return sendResponse(res, null, 400, ["Неверный логин или пароль"]);
    }
    const token = generateToken(user);
    return sendResponse(res, token, 200);
  } catch (e: any) {
    return sendResponse(res, null, 500, [e.message]);
  }
});

app.post("/Account/google", async (req, res) => {
  try {
    let { credential, email, name, picture, googleId } = req.body;
    if (credential) {
      const decodedPayload: any = jwt.decode(credential);
      if (decodedPayload) {
        email = decodedPayload.email;
        name = decodedPayload.name || decodedPayload.given_name;
        picture = decodedPayload.picture;
        googleId = decodedPayload.sub;
      }
    }
    if (!email) {
      return sendResponse(res, null, 400, ["Email от Google обязателен"]);
    }
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const baseUserName = email.split("@")[0] + "_" + Math.floor(100 + Math.random() * 900);
      user = await prisma.user.create({
        data: {
          email,
          userName: baseUserName,
          firstName: name?.split(" ")[0] || "",
          lastName: name?.split(" ")[1] || "",
          googleId: googleId || email,
          image: picture || "default-avatar.png",
        },
      });
    }
    const token = generateToken(user);
    return sendResponse(res, token, 200);
  } catch (e: any) {
    return sendResponse(res, null, 500, [e.message]);
  }
});

app.get("/Brand/get-brands", async (req, res) => {
  const BrandName = (req.query.BrandName as string) || "";
  const brands = await prisma.brand.findMany({
    where: BrandName ? { brandName: { contains: BrandName } } : undefined,
  });
  return sendResponse(res, brands);
});

app.get("/Brand/get-brand-by-id", async (req, res) => {
  const id = Number(req.query.id);
  const brand = await prisma.brand.findUnique({ where: { id } });
  return sendResponse(res, brand);
});

app.post("/Brand/add-brand", async (req, res) => {
  const brandName = (req.query.BrandName as string) || req.body.brandName || req.body.BrandName;
  const brand = await prisma.brand.create({ data: { brandName } });
  return sendResponse(res, brand);
});

app.put("/Brand/update-brand", async (req, res) => {
  const id = Number(req.query.Id || req.body.id || req.body.Id);
  const brandName = (req.query.BrandName as string) || req.body.brandName || req.body.BrandName;
  const brand = await prisma.brand.update({ where: { id }, data: { brandName } });
  return sendResponse(res, brand);
});

app.delete("/Brand/delete-brand", async (req, res) => {
  const id = Number(req.query.id || req.body.id);
  await prisma.brand.delete({ where: { id } });
  return sendResponse(res, "Successfully deleted");
});

app.get("/Color/get-colors", async (req, res) => {
  const ColorName = (req.query.ColorName as string) || "";
  const colors = await prisma.color.findMany({
    where: ColorName ? { colorName: { contains: ColorName } } : undefined,
  });
  return sendResponse(res, colors);
});

app.post("/Color/add-color", async (req, res) => {
  const colorName = (req.query.ColorName as string) || req.body.colorName || req.body.ColorName;
  const color = await prisma.color.create({ data: { colorName } });
  return sendResponse(res, color);
});

app.put("/Color/update-color", async (req, res) => {
  const id = Number(req.query.Id || req.body.id || req.body.Id);
  const colorName = (req.query.ColorName as string) || req.body.colorName || req.body.ColorName;
  const color = await prisma.color.update({ where: { id }, data: { colorName } });
  return sendResponse(res, color);
});

app.delete("/Color/delete-color", async (req, res) => {
  const id = Number(req.query.id || req.body.id);
  await prisma.color.delete({ where: { id } });
  return sendResponse(res, "Successfully deleted");
});

app.get("/Category/get-categories", async (_req, res) => {
  const categories = await prisma.category.findMany({ include: { subCategories: true } });
  return sendResponse(res, categories);
});

app.get("/Category/get-category-by-id", async (req, res) => {
  const id = Number(req.query.id);
  const category = await prisma.category.findUnique({
    where: { id },
    include: { subCategories: true },
  });
  return sendResponse(res, category);
});

app.post("/Category/add-category", upload.single("CategoryImage"), async (req, res) => {
  const categoryName = req.body.CategoryName || (req.query.CategoryName as string);
  const categoryImage = req.file ? req.file.filename : "default-category.png";
  const category = await prisma.category.create({ data: { categoryName, categoryImage } });
  return sendResponse(res, category);
});

app.put("/Category/update-category", upload.single("CategoryImage"), async (req, res) => {
  const id = Number(req.body.Id || req.query.Id);
  const categoryName = req.body.CategoryName || (req.query.CategoryName as string);
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return sendResponse(res, null, 404, ["Category not found"]);

  const category = await prisma.category.update({
    where: { id },
    data: {
      categoryName: categoryName || existing.categoryName,
      categoryImage: req.file ? req.file.filename : existing.categoryImage,
    },
  });
  return sendResponse(res, category);
});

app.delete("/Category/delete-category", async (req, res) => {
  const id = Number(req.query.id);
  await prisma.category.delete({ where: { id } });
  return sendResponse(res, "Deleted");
});

app.get("/SubCategory/get-sub-category", async (_req, res) => {
  const subCategories = await prisma.subCategory.findMany();
  return sendResponse(res, subCategories);
});

app.post("/SubCategory/add-sub-category", async (req, res) => {
  const categoryId = Number(req.query.CategoryId || req.body.categoryId || req.body.CategoryId);
  const subCategoryName =
    (req.query.SubCategoryName as string) || req.body.subCategoryName || req.body.SubCategoryName;
  const sub = await prisma.subCategory.create({ data: { categoryId, subCategoryName } });
  return sendResponse(res, sub);
});

app.put("/SubCategory/update-sub-category", async (req, res) => {
  const id = Number(req.query.Id || req.body.id || req.body.Id);
  const categoryId = Number(req.query.CategoryId || req.body.categoryId || req.body.CategoryId);
  const subCategoryName =
    (req.query.SubCategoryName as string) || req.body.subCategoryName || req.body.SubCategoryName;
  const sub = await prisma.subCategory.update({
    where: { id },
    data: { categoryId, subCategoryName },
  });
  return sendResponse(res, sub);
});

app.delete("/SubCategory/delete-sub-category", async (req, res) => {
  const id = Number(req.query.id);
  await prisma.subCategory.delete({ where: { id } });
  return sendResponse(res, "Deleted");
});

app.get("/Product/get-products", async (req, res) => {
  const {
    ProductName,
    MinPrice,
    MaxPrice,
    BrandId,
    ColorId,
    CategoryId,
    SubcategoryId,
    SubCategoryId,
    PageNumber = 1,
    PageSize = 10,
  } = req.query;

  const where: any = {};
  if (ProductName) where.productName = { contains: String(ProductName) };
  if (MinPrice || MaxPrice) {
    where.price = {};
    if (MinPrice) where.price.gte = Number(MinPrice);
    if (MaxPrice) where.price.lte = Number(MaxPrice);
  }
  if (BrandId) where.brandId = Number(BrandId);
  if (ColorId) where.colorId = Number(ColorId);
  const subId = SubcategoryId || SubCategoryId;
  if (subId) where.subCategoryId = Number(subId);
  if (CategoryId) where.subCategory = { categoryId: Number(CategoryId) };

  const pageNum = Math.max(1, Number(PageNumber));
  const pageSize = Math.max(1, Number(PageSize));
  const totalRecord = await prisma.product.count({ where });

  const rawProducts = await prisma.product.findMany({
    where,
    include: { images: true, color: true, brand: true, subCategory: { include: { category: true } } },
    skip: (pageNum - 1) * pageSize,
    take: pageSize,
    orderBy: { id: "desc" },
  });

  const products = rawProducts.map((p) => ({
    id: p.id,
    productName: p.productName,
    image: p.images[0]?.images || "default-product.png",
    images: p.images,
    color: p.color.colorName,
    brand: p.brand.brandName,
    price: p.price,
    hasDiscount: p.hasDiscount,
    discountPrice: p.discountPrice,
    quantity: p.quantity,
    categoryId: p.subCategory.categoryId,
    categoryName: p.subCategory.category.categoryName,
    subCategoryId: p.subCategoryId,
  }));

  return res.json({
    pageNumber: pageNum,
    pageSize,
    totalPage: Math.ceil(totalRecord / pageSize),
    totalRecord,
    data: { products, brands: await prisma.brand.findMany(), colors: await prisma.color.findMany() },
    statusCode: 200,
    errors: [],
  });
});

app.get("/Product/get-product-by-id", async (req, res) => {
  const id = Number(req.query.id);
  const p = await prisma.product.findUnique({
    where: { id },
    include: { images: true, color: true, brand: true, subCategory: true },
  });
  if (!p) return sendResponse(res, null, 404, ["Product not found"]);
  return sendResponse(res, {
    ...p,
    image: p.images[0]?.images || "default-product.png",
    color: p.color.colorName,
    brand: p.brand.brandName,
  });
});

app.post("/Product/add-product", upload.array("Images", 10), async (req, res) => {
  try {
    const b = req.body;
    const files = (req.files as Express.Multer.File[]) || [];
    const product = await prisma.product.create({
      data: {
        productName: b.ProductName,
        description: b.Description || "",
        quantity: Number(b.Quantity || 1),
        weight: b.Weight || "",
        size: b.Size || "",
        code: b.Code || `SKU-${Date.now()}`,
        price: Number(b.Price),
        hasDiscount: String(b.HasDiscount) === "true",
        discountPrice: Number(b.DiscountPrice || 0),
        brandId: Number(b.BrandId),
        colorId: Number(b.ColorId),
        subCategoryId: Number(b.SubCategoryId),
        images: {
          create: files.map((f) => ({ images: f.filename })),
        },
      },
      include: { images: true },
    });
    return sendResponse(res, product);
  } catch (e: any) {
    return sendResponse(res, null, 400, [e.message]);
  }
});

app.put("/Product/update-product", async (req, res) => {
  try {
    const src = { ...req.query, ...req.body };
    const id = Number(src.Id || src.id);
    const updated = await prisma.product.update({
      where: { id },
      data: {
        productName: src.ProductName ?? src.productName,
        description: src.Description ?? src.description,
        quantity: src.Quantity !== undefined ? Number(src.Quantity) : undefined,
        price: src.Price !== undefined ? Number(src.Price) : undefined,
        hasDiscount: src.HasDiscount !== undefined ? String(src.HasDiscount) === "true" : undefined,
        discountPrice: src.DiscountPrice !== undefined ? Number(src.DiscountPrice) : undefined,
        brandId: src.BrandId !== undefined ? Number(src.BrandId) : undefined,
        colorId: src.ColorId !== undefined ? Number(src.ColorId) : undefined,
        subCategoryId: src.SubCategoryId !== undefined ? Number(src.SubCategoryId) : undefined,
      },
    });
    return sendResponse(res, updated);
  } catch (e: any) {
    return sendResponse(res, null, 400, [e.message]);
  }
});

app.delete("/Product/delete-product", async (req, res) => {
  const id = Number(req.query.id);
  await prisma.product.delete({ where: { id } });
  return sendResponse(res, "Product deleted");
});

app.get("/Cart/get-products-from-cart", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.sid;
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: { include: { images: true, color: true, brand: true } } },
  });

  const productsInCart = items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    product: {
      ...item.product,
      image: item.product.images[0]?.images || "default-product.png",
      color: item.product.color.colorName,
    },
  }));

  const totalProducts = productsInCart.reduce((acc, i) => acc + i.quantity, 0);
  const totalPrice = productsInCart.reduce((acc, i) => acc + i.product.price * i.quantity, 0);
  const totalDiscountPrice = productsInCart.reduce(
    (acc, i) =>
      acc + (i.product.hasDiscount ? i.product.discountPrice : i.product.price) * i.quantity,
    0
  );

  return sendResponse(res, [{ productsInCart, totalProducts, totalPrice, totalDiscountPrice }]);
});

app.post("/Cart/add-product-to-cart", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.sid;
  const productId = Number(req.query.id || req.body.id);

  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + 1 },
    });
  } else {
    await prisma.cartItem.create({ data: { userId, productId, quantity: 1 } });
  }
  return sendResponse(res, "Added to cart");
});

app.put("/Cart/increase-product-in-cart", authMiddleware, async (req: AuthRequest, res) => {
  const id = Number(req.query.id || req.body.id);
  const item = await prisma.cartItem.findFirst({
    where: { userId: req.user!.sid, OR: [{ id }, { productId: id }] },
  });
  if (!item) return sendResponse(res, null, 404, ["Item not in cart"]);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: item.quantity + 1 } });
  return sendResponse(res, "Increased");
});

app.put("/Cart/reduce-product-in-cart", authMiddleware, async (req: AuthRequest, res) => {
  const id = Number(req.query.id || req.body.id);
  const item = await prisma.cartItem.findFirst({
    where: { userId: req.user!.sid, OR: [{ id }, { productId: id }] },
  });
  if (!item) return sendResponse(res, null, 404, ["Item not in cart"]);
  if (item.quantity <= 1) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: item.quantity - 1 } });
  }
  return sendResponse(res, "Reduced");
});

app.delete("/Cart/delete-product-from-cart", authMiddleware, async (req: AuthRequest, res) => {
  const id = Number(req.query.id || req.body.id);
  await prisma.cartItem.deleteMany({
    where: { userId: req.user!.sid, OR: [{ id }, { productId: id }] },
  });
  return sendResponse(res, "Deleted from cart");
});

app.delete("/Cart/clear-cart", authMiddleware, async (req: AuthRequest, res) => {
  await prisma.cartItem.deleteMany({ where: { userId: req.user!.sid } });
  return sendResponse(res, "Cart cleared");
});

app.post("/Order/checkout", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.sid;
  const { address = "", phone = "" } = req.body;
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
  });
  if (cartItems.length === 0) return sendResponse(res, null, 400, ["Корзина пуста"]);

  const totalAmount = cartItems.reduce(
    (sum, i) => sum + (i.product.hasDiscount ? i.product.discountPrice : i.product.price) * i.quantity,
    0
  );

  const order = await prisma.order.create({
    data: {
      userId,
      address,
      phone,
      totalAmount,
      itemsJson: JSON.stringify(cartItems),
    },
  });

  await prisma.cartItem.deleteMany({ where: { userId } });
  return sendResponse(res, order);
});

async function seedDatabase() {
  const count = await prisma.category.count();
  if (count > 0) return;

  console.log("🌱 Заполняем базу стартовыми данными...");
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      userName: "admin",
      email: "admin@softclub.tj",
      password: adminPassword,
      role: "Admin",
      firstName: "Admin",
      lastName: "SoftClub",
    },
  });

  const apple = await prisma.brand.create({ data: { brandName: "Apple" } });
  const samsung = await prisma.brand.create({ data: { brandName: "Samsung" } });
  const black = await prisma.color.create({ data: { colorName: "Black" } });
  const titanium = await prisma.color.create({ data: { colorName: "Natural Titanium" } });

  const cat = await prisma.category.create({
    data: {
      categoryName: "Electronics",
      categoryImage: "electronics.png",
      subCategories: {
        create: [{ subCategoryName: "Smartphones" }, { subCategoryName: "Laptops" }],
      },
    },
    include: { subCategories: true },
  });

  await prisma.product.create({
    data: {
      productName: "iPhone 16 Pro 256GB",
      description: "Flagship Apple smartphone with A18 Pro chip",
      price: 1199,
      hasDiscount: true,
      discountPrice: 1099,
      quantity: 15,
      code: "IP16PRO",
      brandId: apple.id,
      colorId: titanium.id,
      subCategoryId: cat.subCategories[0].id,
    },
  });
  console.log("✅ Готово! Логин админа: admin / Пароль: admin123");
}

app.listen(PORT, async () => {
  await seedDatabase();
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
  console.log(`📄 Swagger UI доступен по адресу: http://localhost:${PORT}/swagger`);
});
