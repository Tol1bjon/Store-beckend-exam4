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
import profileRouter from "./routes/profile";

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

// Если картинки нет в локальной папке uploads – берём её со старого сервера!
app.get("/images/:fileName", (req, res) => {
  res.redirect(`https://store-api.softclub.tj/images/${req.params.fileName}`);
});

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

app.use("/UserProfile", profileRouter);

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
  const alreadySeeded = await prisma.product.findUnique({ where: { id: 409 } });
if (alreadySeeded) return;
  try {
    console.log("🌱 Переносим данные из оригинального Store API...");

    // 1. Очищаем старые тестовые данные, чтобы не было конфликтов ID
    await prisma.cartItem.deleteMany();
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.subCategory.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.color.deleteMany();

    // 2. Создаём админа (если его ещё нет)
    const adminExists = await prisma.user.findFirst({ where: { userName: "admin" } });
    if (!adminExists) {
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.default.hash("admin123", 10);
      await prisma.user.create({
        data: {
          userName: "admin",
          email: "admin@store.tj",
          phoneNumber: "+992900000000",
          password: hashedPassword,
          role: "Admin",
        },
      });
    }

    // 3. Загружаем все Бренды (сохраняем оригинальные ID)
    const brands = [
      { id: 36, brandName: "Samsung" },
      { id: 42, brandName: "Huawei" },
      { id: 43, brandName: "ASUS" },
      { id: 50, brandName: "Sennheiser" },
      { id: 71, brandName: "madin01" },
      { id: 73, brandName: "Comfort Trends" },
      { id: 74, brandName: "Calvin Klein" },
      { id: 75, brandName: "Fashion Diva" },
      { id: 76, brandName: "Pampi" },
      { id: 77, brandName: "Fashion Express" },
      { id: 78, brandName: "Fashionista" },
      { id: 79, brandName: "Heshe" },
      { id: 80, brandName: "Prada" },
      { id: 81, brandName: "Urban Chic" },
      { id: 82, brandName: "Elegance Collection" },
      { id: 83, brandName: "IWC" },
      { id: 84, brandName: "Rolex" },
      { id: 85, brandName: "Fashion Gold" },
      { id: 86, brandName: "Fashion Co." },
      { id: 87, brandName: "Fashion Trends" },
      { id: 88, brandName: "Gigabyte" },
      { id: 89, brandName: "Classic Wear" },
      { id: 91, brandName: "Nike" },
      { id: 94, brandName: "Fashion Timepieces" },
      { id: 95, brandName: "Longines" },
      { id: 96, brandName: "Fashion Shades" },
      { id: 98, brandName: "Apple" },
      { id: 99, brandName: "Oppo" },
      { id: 100, brandName: "Lenovo" },
      { id: 101, brandName: "Dell" },
      { id: 102, brandName: "Amazon" },
      { id: 103, brandName: "Annibale Colombo" },
      { id: 108, brandName: "FastCart" },
      { id: 109, brandName: "Essence" },
      { id: 110, brandName: "Attitude" },
      { id: 111, brandName: "Glamour Beauty" },
      { id: 112, brandName: "Chanel" },
      { id: 113, brandName: "Olay" },
    ];
    for (const b of brands) {
      await prisma.brand.create({ data: b });
    }

    // 4. Загружаем все Цвета
    const colors = [
      { id: 1, colorName: "q" },
      { id: 2, colorName: "Black" },
      { id: 3, colorName: "Silver" },
      { id: 4, colorName: "Blue" },
      { id: 5, colorName: "Magenta" },
      { id: 6, colorName: "jh" },
      { id: 7, colorName: "#901313" },
      { id: 10, colorName: "whiteee" },
      { id: 12, colorName: "red" },
      { id: 13, colorName: "blue" },
      { id: 14, colorName: "#00ff33" },
      { id: 15, colorName: "#4c88e0" },
      { id: 16, colorName: "#2563eb" },
      { id: 18, colorName: "Gray" },
      { id: 19, colorName: "Gold" },
      { id: 22, colorName: "#1231" },
      { id: 23, colorName: "chimchi" },
      { id: 24, colorName: "green" },
      { id: 25, colorName: "#2563EB" },
      { id: 26, colorName: "#414856" },
      { id: 28, colorName: "White" },
      { id: 29, colorName: "Brown" },
      { id: 30, colorName: "Pink" },
    ];
    for (const c of colors) {
      await prisma.color.create({ data: c });
    }

    // 5. Загружаем Категории вместе с их Подкатегориями
    const categories = [
      {
        id: 21,
        categoryName: "SmartWatch",
        categoryImage: "2c0ab3cf-47b8-401f-b692-59e6db0132f5.png",
        subCategories: [
          { id: 181, subCategoryName: "Smartwatches" },
          { id: 178, subCategoryName: "Motorola_I" },
        ],
      },
      {
        id: 22,
        categoryName: "Computers",
        categoryImage: "c950cdfe-3365-4570-bfeb-fa6143e1d88c.png",
        subCategories: [
          { id: 183, subCategoryName: "Laptops" },
          { id: 184, subCategoryName: "Monitor" },
          { id: 175, subCategoryName: "MacBook" },
          { id: 202, subCategoryName: "xz nb,./" },
          { id: 185, subCategoryName: "Desktops" },
        ],
      },
      {
        id: 23,
        categoryName: "Gaming",
        categoryImage: "4c578867-e35d-4ca3-bf70-55a7e969b8c7.png",
        subCategories: [
          { id: 187, subCategoryName: "Controllers" },
          { id: 161, subCategoryName: "Audi" },
          { id: 163, subCategoryName: "Pc_" },
        ],
      },
      {
        id: 30,
        categoryName: "Cars",
        categoryImage: "021f75e4-e546-40db-ba33-691b24b85b30.png",
        subCategories: [
          { id: 154, subCategoryName: "Toyota" },
          { id: 168, subCategoryName: "tayota" },
          { id: 165, subCategoryName: "Nascar types" },
          { id: 160, subCategoryName: "Koenigsegg" },
          { id: 159, subCategoryName: "Mitsubishi" },
        ],
      },
      {
        id: 41,
        categoryName: "Medicine",
        categoryImage: "c584737c-bd71-46cc-bf3a-672ecc8d0025.png",
        subCategories: [],
      },
      {
        id: 43,
        categoryName: "Baby’s & Toys",
        categoryImage: "d7e1581a-7251-4551-b994-3fc96e12c6c5.png",
        subCategories: [{ id: 232, subCategoryName: "Challenge" }],
      },
      {
        id: 54,
        categoryName: "Phones",
        categoryImage: "37c3e6e9-4395-4e1f-b092-7ca77b0a19cd.jpeg",
        subCategories: [
          { id: 193, subCategoryName: "Huawei" },
          { id: 191, subCategoryName: "Флагманы" },
        ],
      },
      {
        id: 68,
        categoryName: "Woman's Fashion",
        categoryImage: "a0f12e77-96b8-41da-9b94-35b6386fd33c.svg",
        subCategories: [
          { id: 203, subCategoryName: "Dresses" },
          { id: 204, subCategoryName: "Shoes" },
          { id: 207, subCategoryName: "Tops" },
          { id: 206, subCategoryName: "Jewellery" },
          { id: 205, subCategoryName: "Bags" },
          { id: 208, subCategoryName: "Watches" },
        ],
      },
      {
        id: 70,
        categoryName: "Electronic",
        categoryImage: "7f2bdcaa-12c8-4b09-922c-abc0361f71fe.jpg",
        subCategories: [
          { id: 214, subCategoryName: "Laptops" },
          { id: 213, subCategoryName: "Smartphones" },
          { id: 216, subCategoryName: "Accessories" },
          { id: 215, subCategoryName: "Tablets" },
        ],
      },
      {
        id: 88,
        categoryName: "Men's Fashion",
        categoryImage: "9412fe6f-42ca-4e38-8efb-d8ea54e10832.svg",
        subCategories: [
          { id: 223, subCategoryName: "Sunglasses" },
          { id: 221, subCategoryName: "Shoes" },
          { id: 220, subCategoryName: "Shirts" },
          { id: 222, subCategoryName: "Watches" },
        ],
      },
      {
        id: 89,
        categoryName: "Home & Lifestyle",
        categoryImage: "ac9757e1-a23d-402f-8609-507ad33ee520.svg",
        subCategories: [
          { id: 225, subCategoryName: "Decoration" },
          { id: 224, subCategoryName: "Furniture" },
          { id: 226, subCategoryName: "Kitchen" },
        ],
      },
      {
        id: 90,
        categoryName: "Sports & Outdoor",
        categoryImage: "6fd74bf6-7361-4bca-b629-8808e3b65173.svg",
        subCategories: [{ id: 227, subCategoryName: "Sports accessories" }],
      },
      {
        id: 91,
        categoryName: "Groceries & Pets",
        categoryImage: "c92da0b0-a209-4440-93f1-f4b856b8c438.svg",
        subCategories: [{ id: 228, subCategoryName: "Groceries" }],
      },
      {
        id: 92,
        categoryName: "Health & Beauty",
        categoryImage: "7b7c8aa7-ebbf-4312-a28c-e1a31431ca61.svg",
        subCategories: [
          { id: 229, subCategoryName: "Beauty" },
          { id: 231, subCategoryName: "Skin care" },
          { id: 230, subCategoryName: "Fragrances" },
        ],
      },
      {
        id: 93,
        categoryName: "Profile",
        categoryImage: "ef7c805e-e486-47c3-b147-80ca1f48d683.jpg",
        subCategories: [],
      },
      {
        id: 96,
        categoryName: "еуые",
        categoryImage: "02158af9-becb-4bb6-a020-201ce72641de.png",
        subCategories: [],
      },
    ];

    for (const cat of categories) {
      await prisma.category.create({
        data: {
          id: cat.id,
          categoryName: cat.categoryName,
          categoryImage: cat.categoryImage,
          subCategories: {
            create: cat.subCategories,
          },
        },
      });
    }

    // 6. Загружаем Товары (Products) со связями к брендам, цветам и подкатегориям
    const products = [
      {
        id: 409,
        productName: "Longines Master Collection",
        image: "0a250880-a9ed-42f6-8c74-567aca829e11.webp",
        price: 1499.99,
        hasDiscount: true,
        discountPrice: 1241.39,
        quantity: 100,
        brandId: 95, // Longines
        colorId: 4, // Blue
        subCategoryId: 222, // Watches (Men's Fashion)
      },
      {
        id: 414,
        productName: "Baseball Ball",
        image: "65bbbf7f-e2d2-4b6e-a81a-9bf960afae67.webp",
        price: 8.99,
        hasDiscount: false,
        discountPrice: 0,
        quantity: 100,
        brandId: 91, // Nike
        colorId: 28, // White
        subCategoryId: 227, // Sports accessories (Sports & Outdoor)
      },
      {
        id: 401,
        productName: "Essence Mascara Lash Princess",
        image: "9ff1a928-1a30-48c1-bbe4-56f30a8f325e.webp",
        price: 9.99,
        hasDiscount: true,
        discountPrice: 8.94,
        quantity: 99,
        brandId: 109, // Essence
        colorId: 18, // Gray
        subCategoryId: 229, // Beauty (Health & Beauty)
      },
      {
        id: 388,
        productName: "Heshe Women's Leather Bag",
        image: "32d0b747-d06c-4202-9fd2-6f494c07008d.webp",
        price: 129.99,
        hasDiscount: false,
        discountPrice: 0,
        quantity: 99,
        brandId: 79, // Heshe
        colorId: 3, // Silver
        subCategoryId: 205, // Bags (Woman's Fashion)
      },
      {
        id: 403,
        productName: "Attitude Super Leaves Hand Soap",
        image: "736a81c0-c378-4650-8fd8-3f555c0d9059.webp",
        price: 8.99,
        hasDiscount: true,
        discountPrice: 7.33,
        quantity: 94,
        brandId: 110, // Attitude
        colorId: 4, // Blue
        subCategoryId: 231, // Skin care (Health & Beauty)
      },
      {
        id: 316,
        productName: "Calvin Klein Heel Shoes",
        image: "185e85ef-5ac5-4730-8dae-37ba4d4921f2.webp",
        price: 79.99,
        hasDiscount: false,
        discountPrice: 0,
        quantity: 93,
        brandId: 74, // Calvin Klein
        colorId: 2, // Black
        subCategoryId: 204, // Shoes (Woman's Fashion)
      },
      {
        id: 369,
        productName: "Samsung Galaxy Tab White",
        image: "0f0e74df-191a-4042-ac46-69be97285d23.webp",
        price: 349.99,
        hasDiscount: true,
        discountPrice: 286.29,
        quantity: 92,
        brandId: 36, // Samsung
        colorId: 28, // White
        subCategoryId: 215, // Tablets (Electronic)
      },
      {
        id: 407,
        productName: "Gigabyte Aorus Men Tshirt",
        image: "36fce477-96bd-4e04-90c9-9f88c100111c.webp",
        price: 24.99,
        hasDiscount: false,
        discountPrice: 0,
        quantity: 90,
        brandId: 88, // Gigabyte
        colorId: 18, // Gray
        subCategoryId: 220, // Shirts (Men's Fashion)
      },
      {
        id: 391,
        productName: "IWC Ingenieur Automatic Steel",
        image: "77646aab-aced-4f13-ae57-12d02c908839.webp",
        price: 4999.99,
        hasDiscount: true,
        discountPrice: 4527.49,
        quantity: 90,
        brandId: 83, // IWC
        colorId: 4, // Blue
        subCategoryId: 208, // Watches (Woman's Fashion)
      },
      {
        id: 317,
        productName: "Golden Shoes Woman",
        image: "03a0e3a1-0c6e-4f3b-a65d-536f2fdab4f8.webp",
        price: 49.99,
        hasDiscount: true,
        discountPrice: 43.03,
        quantity: 88,
        brandId: 85, // Fashion Gold
        colorId: 19, // Gold
        subCategoryId: 204, // Shoes (Woman's Fashion)
      },
    ];

    for (const p of products) {
      await prisma.product.create({
        data: {
          id: p.id,
          productName: p.productName,
          description: p.productName,
          code: `SKU-${p.id}`,
          price: p.price,
          hasDiscount: p.hasDiscount,
          discountPrice: p.discountPrice,
          quantity: p.quantity,
          brandId: p.brandId,
          colorId: p.colorId,
          subCategoryId: p.subCategoryId,
          images: {
            create: [{ images: p.image }],
          },
        },
      });
    }

    console.log("✅ Все оригинальные данные успешно загружены в базу!");
  } catch (error) {
    console.error("Ошибка при автозаполнении базы:", error);
  }
}

app.listen(PORT, async () => {
  await seedDatabase();
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
  console.log(`📄 Swagger UI доступен по адресу: http://localhost:${PORT}/swagger`);
});
