const { PrismaClient } = require("../generated/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_EXPIRES_IN, JWT_SECRET } = require("../config/jwt");
const MESSAGES = require("../constants/messages");

const prisma = new PrismaClient();

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({
        error: MESSAGES.USER_ALREADY_EXISTS,
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
      select: {
        id: true,
        createdAt: true,
        name: true,
        email: true,
      },
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.status(201).json({
      message: MESSAGES.USER_REGISTERED_SUCCESS,
      data: user,
      token,
    });
  } catch (error) {
    console.error("Registration Error");
    res.status(500).json({ message: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      res.status(401).json({
        message: MESSAGES.INVALID_CREDENTIALS,
      });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({
        message: MESSAGES.INVALID_EMAIL_OR_PASSWORD,
      });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.status(200).json({
      message: MESSAGES.LOGIN_SUCCESS,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch {
    console.error("Internal server error");
    res.status(500).json({
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};
const getUserDetails = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
    if (!user) {
      return res.status(404).json({
        message: MESSAGES.USER_DETAILS_NOT_FOUND,
      });
    }
    res.status(200).json({
      message: MESSAGES.USER_DATA_RETRIEVED_SUCCESS,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user details", error);
    res.status(500).json({
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};
module.exports = {
  register,
  login,
  getUserDetails,
};
