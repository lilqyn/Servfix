import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const payoutsRouter = Router();

const requestSchema = z.object({
  amount: z.coerce.number().positive(),
});

const ensureWallet = async (providerId: string) =>
  prisma.providerWallet.upsert({
    where: { providerId },
    create: {
      providerId,
      availableBalance: new Prisma.Decimal(0),
      pendingBalance: new Prisma.Decimal(0),
      currency: "GHS",
    },
    update: {},
  });

payoutsRouter.get(
  "/",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const wallet = await ensureWallet(req.user!.id);
    const requests = await prisma.payoutRequest.findMany({
      where: { providerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      wallet: {
        availableBalance: wallet.availableBalance.toString(),
        pendingBalance: wallet.pendingBalance.toString(),
        currency: wallet.currency,
      },
      requests: requests.map((request) => ({
        id: request.id,
        amount: request.amount.toString(),
        currency: request.currency,
        status: request.status,
        destinationMomo: request.destinationMomo,
        momoNetwork: request.momoNetwork,
        reference: request.reference,
        createdAt: request.createdAt,
      })),
    });
  }),
);

payoutsRouter.post(
  "/",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    const provider = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        providerProfile: {
          select: { momoNumber: true, momoNetwork: true },
        },
      },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found." });
    }

    const momoNumber = provider.providerProfile?.momoNumber ?? null;
    const momoNetwork = provider.providerProfile?.momoNetwork ?? null;

    if (!momoNumber || !momoNetwork) {
      return res.status(400).json({
        error: "Please add your mobile money number and network in account settings.",
      });
    }

    if (!settings.payoutRules.supportedMomoNetworks.includes(momoNetwork)) {
      return res.status(400).json({
        error: "Selected mobile money network is not supported for payouts.",
      });
    }

    const wallet = await ensureWallet(req.user!.id);
    const amount = new Prisma.Decimal(data.amount);

    if (settings.payoutRules.minAmount > 0 && amount.lt(settings.payoutRules.minAmount)) {
      return res.status(400).json({
        error: `Minimum payout amount is ${settings.payoutRules.minAmount}.`,
      });
    }

    if (wallet.availableBalance.lt(amount)) {
      return res.status(400).json({ error: "Insufficient available balance." });
    }

    const request = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.providerWallet.update({
        where: { providerId: req.user!.id },
        data: {
          availableBalance: { decrement: amount },
          pendingBalance: { increment: amount },
        },
      });

      const payoutRequest = await tx.payoutRequest.create({
        data: {
          providerId: req.user!.id,
          amount,
          currency: updatedWallet.currency,
          destinationMomo: momoNumber,
          momoNetwork,
          status: "requested",
        },
      });

      return payoutRequest;
    });

    res.status(201).json({
      request: {
        id: request.id,
        amount: request.amount.toString(),
        currency: request.currency,
        status: request.status,
        destinationMomo: request.destinationMomo,
        momoNetwork: request.momoNetwork,
        reference: request.reference,
        createdAt: request.createdAt,
      },
    });
  }),
);
