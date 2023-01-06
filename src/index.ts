import prisma from "./prisma/client";
import { createServer } from "http";
import cors from "cors";
import { json } from "body-parser";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import gql from "graphql-tag";
import { GraphQLError } from "graphql";
import { User } from "@prisma/client";
import jsonwebtoken from "jsonwebtoken";

interface MyContext {
  user?: User;
}

const startServer = async () => {
  const app = express()
  const httpServer = createServer(app)

  const port = process.env.PORT || 4000;
  const path = process.env.GQL_PATH || "/graphql";
  
  const secret = process.env.JWT_SECRET || "SECRET";
  const accessTokenExpiresIn = process.env.ACCESS_TOKEN_EXPIRATION_TIME || "1m";
  const refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRATION_TIME || "2m";

  const typeDefs = gql`
    scalar Date

    type Mutation {
      registerUser(username: String!, password: String!, passwordVerify: String!): User
      loginUser(username: String!, password: String!): String
      createConversation(name: String!, memberIds: [String!]!): Conversation
      createMessage(conversationId: String!, authorId: String!, text: String!): Message
    }

    type Query {
      users: [User]
      conversations: [Conversation]
      conversationById(conversationId: String!): Conversation
      conversationsByUserId(userId: String!): [Conversation]
    }

    type RefreshToken {
      id: ID!
      userId: String!
      token: String!
      createdAt: Date!
      createdByIp: String!
      expiresAt: Date!
      replacedByToken: String
      revokedAt: Date!
      revokedByIp: String
      reasonRevoked: String
    }

    type User {
      id: ID!
      username: String!
      password: String
      deleted: Boolean
      createdAt: Date!
      updatedAt: Date
    }

    type Conversation {
      id: ID!
      name: String
      users: [ConversationUser!]!
      deleted: Boolean
      createdAt: Date!
      updatedAt: Date
    }

    type Message {
      id: ID!
      conversationId: String
      authorId: String
      text: String
      deleted: Boolean
      createdAt: Date!
      updatedAt: Date
    }

    type ConversationUser {
      user: User!
      role: ConversationUserRole!
      deleted: Boolean
      createdAt: Date!
      updatedAt: Date
    }

    type ConversationUserRole {
      id: ID!
      name: String
    }
  `;

  const resolvers = {
    Mutation: {
      registerUser: async (
        obj: any,
        args: { username: string; password: string; passwordVerify: string; },
        context: any,
        info: any,
      ) => {
        const { username, password, passwordVerify} = args;

        // Validate params
        if (password !== passwordVerify) {
          return null;
        }
        
        // Create user
        return prisma.user.create({
          data: {
            username,
            password,
          },
        });
      },
      loginUser: async (
        obj: any,
        args: { username: string; password: string; },
        context: any,
        info: any,
      ) => {
        const user = await getUserByUsername(args.username);
        if (user === null) {
          return;
        }

        const accessToken = await createJwtToken(user.id);
        const refreshToken = await createRefreshToken(user.id);
        if (!accessToken || !refreshToken) {
          return;
        }

        return accessToken;
      },
      createConversation: async (
        obj: any,
        args: { name: string; memberIds: string[] },
        context: { user: User },
        info: any,
      ) => {
        const { user } = context;
        const { name, memberIds } = args;

        // Not logged in? Throw error
        if (!user) {
          throw new GraphQLError("User is not authenticated", {
            extensions: {
              code: "UNAUTHENTICATED",
              http: { status: 401 },
            },
          });
        }

        // Create conversation
        return prisma.conversation.create({
          include: {
            conversationUsers: true,
          },
          data: {
            name,
            conversationUsers: {
              createMany: {
                data: [
                  { userId: user.id, roleId: "ADMIN" },
                  ...memberIds.map((id) => ({ userId: id, roleId: "MEMBER" }))
                ],
              }
            }
          }
        });
      },
      createMessage: async (
        obj: any,
        args: { conversationId: string, authorId: string, text: string },
        context: { user: User },
        info: any,
      ) => {
        const { user } = context;
        const { conversationId, authorId, text } = args;

        // Not logged in? Throw error
        if (!user) {
          throw new GraphQLError("User is not authenticated", {
            extensions: {
              code: "UNAUTHENTICATED",
              http: { status: 401 },
            },
          });
        }

        // Create user
        return prisma.message.create({
          data: {
            conversationId,
            authorId,
            text,
          }
        });
      },
    },
    Query: {
      users: () => {
        return prisma.user.findMany();
      },
      conversations: () => {
        return prisma.conversation.findMany();
      },
      conversationById: (conversationId: string) => {
        return prisma.conversation.findFirst({
          where: { id: conversationId }
        });
      },
      conversationsByUserId: (userId: string) => {
        return prisma.conversationUser.findMany({
          where: { userId },
          include: {
            conversation: true,
            user: true,
            role: true,
          },
        });
      },
    },
  };

  const createJwtToken = async (id: string, role: string = ""): Promise<string> => {
    return new Promise((resolve, reject) => {
      jsonwebtoken.sign({
        data: { id, role }
      }, secret, { expiresIn: accessTokenExpiresIn }, (error, encoded) => {
        // Error? throw
        if (error) {
          throw new GraphQLError(error.message, {
            extensions: {
              code: error.name,
              http: { status: 401 },
            },
          });
        }
        if (encoded === undefined) {
          reject();
          return;
        }
        resolve(encoded);
      });
    });
  };

  const createRefreshToken = (id: string, role: string = ""): Promise<string> => {
    return new Promise((resolve, reject) => {
      jsonwebtoken.sign({
        data: { id, role }
      }, secret, { expiresIn: accessTokenExpiresIn }, (error, encoded) => {
        // Error? throw
        if (error) {
          throw new GraphQLError(error.message, {
            extensions: {
              code: error.name,
              http: { status: 401 },
            },
          });
        }
        // ?????
        if (encoded === undefined) {
          reject();
          return;
        }
        resolve(encoded);
      });
    });
  };

  const getUserByToken = async (token: string) => {
    const userId: string | undefined = await new Promise((resolve) => {
      // TODO: Here we should validate issuer and everything else
      jsonwebtoken.verify(token, secret, (error, decoded) => {
        // Error? throw
        if (error) {
          throw new GraphQLError(error.message, {
            extensions: {
              code: error.name,
              http: { status: 401 },
            },
          });
        }
        // ?????
        if (decoded === undefined) {
          resolve(decoded);
          return;
        }
        // ?????
        if (typeof decoded === "string") {
          resolve(decoded);
          return;
        }
        // ?????
        resolve(decoded.sub)
      });
    });
    // Find user in db
    const user = await prisma.user.findFirst({
      where: { id: userId }
    });    
    return user;
  };

  const getUserByUsername = async (username: string) => {
    // Find user in db
    const user = await prisma.user.findFirst({
      where: { username },
    });    
    return user;
  };
  
  // Load configuration for Apollo
  const apolloServer = new ApolloServer<MyContext>({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await apolloServer.start();
  
  app.use(
    path,
    cors<cors.CorsRequest>({
      origin: ["*"],
    }),
    json(),
    expressMiddleware(apolloServer, {
      context: async ({ req, res }) => {
        try { 
          // Get the user token from the headers.
          const authorizationHeader = req.headers.authorization || "";
          const token = authorizationHeader.split("Bearer ")[0];          
          // Try to retrieve a user with the token
          const user = await getUserByToken(token[0]);
          // Add the user to the context
          return { user };
        } catch {
          return {};
        }
      },
    }),
  );

  // Start server
  await new Promise<void>((resolve) => httpServer.listen({ port: 4000 }, resolve));
  console.log(`🚀 Server ready at http://localhost:${port}${path}`);
}

startServer()