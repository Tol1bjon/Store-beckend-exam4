import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-softclub-key-2026";

// Вспомогательная функция для извлечения ID юзера из токена
const getUserIdFromHeader = (req: Request) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split(" ")[1];
    const decoded: any = jwt.verify(token, JWT_SECRET);
    return decoded.id || decoded.sid;
  } catch {
    return null;
  }
};

/**
 * @swagger
 * /UserProfile/get-user-profile:
 *   get:
 *     tags: [UserProfile]
 *     summary: Получить данные профиля для страницы My Account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Профиль успешно получен
 */
router.get("/get-user-profile", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) {
      return res.status(401).json({ statusCode: 401, data: null, errors: ["Не авторизован"] });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userName: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        address: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ statusCode: 404, data: null, errors: ["Пользователь не найден"] });
    }

    // Если firstName еще пустой, подставляем userName по умолчанию
    return res.status(200).json({
      statusCode: 200,
      data: {
        ...user,
        firstName: user.firstName || user.userName,
        lastName: user.lastName || "",
        address: user.address || "",
      },
      errors: [],
    });
  } catch (error) {
    return res.status(401).json({ statusCode: 401, data: null, errors: ["Неверный токен"] });
  }
});

// Получить профиль по ID
/**
 * @swagger
 * /UserProfile/get-user-profile-by-id:
 *   get:
 *     tags: [UserProfile]
 *     summary: Получить профиль пользователя по ID
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Успешно
 */
router.get("/get-user-profile-by-id", async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        statusCode: 400,
        data: null,
        errors: ["Параметр id обязателен"],
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        userName: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        address: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        errors: ["Пользователь не найден"],
      });
    }

    return res.status(200).json({
      statusCode: 200,
      data: {
        ...user,
        firstName: user.firstName || user.userName,
        lastName: user.lastName || "",
        address: user.address || "",
      },
      errors: [],
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      data: null,
      errors: ["Ошибка сервера при получении профиля"],
    });
  }
});

/**
 * @swagger
 * /UserProfile/update-user-profile:
 *   put:
 *     tags: [UserProfile]
 *     summary: Обновить First name, Last name, Email, Street address и пароль
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Профиль успешно обновлен
 */
router.put("/update-user-profile", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) {
      return res.status(401).json({ statusCode: 401, data: null, errors: ["Не авторизован"] });
    }

    const { firstName, lastName, email, address, phoneNumber, currentPassword, newPassword } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return res.status(404).json({ statusCode: 404, data: null, errors: ["Пользователь не найден"] });
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;

    // Если пользователь заполнил поля смены пароля
    if (currentPassword && newPassword) {
      if (!existingUser.password) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          errors: ["У пользователя не установлен пароль (вход через Google)"],
        });
      }
      const isPasswordValid = await bcrypt.compare(currentPassword, existingUser.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          errors: ["Текущий пароль введен неверно"],
        });
      }
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        userName: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        address: true,
        role: true,
      },
    });

    return res.status(200).json({
      statusCode: 200,
      data: updatedUser,
      errors: [],
    });
  } catch (error) {
    return res.status(400).json({
      statusCode: 400,
      data: null,
      errors: ["Ошибка при обновлении профиля"],
    });
  }
});

export default router;
