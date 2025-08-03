const { PrismaClient } = require("../generated/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_EXPIRES_IN, JWT_SECRET } = require("../config/jwt");

const prisma = new PrismaClient();

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
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
      message: "User registered successfully",
      data: user,
      token,
    });
  } catch (error) {
    console.error("Registration Error");
    res.status(500).json({ message: "Internal server error" });
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
        message: "Invalid credentials",
      });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({
        message: "Invalid email or password",
      });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.status(200).json({
      message: "Login successful",
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
      message: "Internal server error",
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
        message: "User details not found",
      });
    }
    res.status(200).json({
      message: "User data retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user details", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};
module.exports = {
  register,
  login,
  getUserDetails,
};
