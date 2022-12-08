import prisma from "./prisma/client";
import { createServer } from "http";
import cors from 'cors';
import { json } from 'body-parser';
import express from "express";
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import gql from 'graphql-tag';

interface MyContext {
  token?: String;
}

const startServer = async () => {
  const app = express()
  const httpServer = createServer(app)

  const port = process.env.PORT || 4000;
  const path = process.env.GQL_PATH || '/graphql';

  const typeDefs = gql`
    scalar Date

    type Mutation {
      createUser(username: String!, password: String!, passwordVerify: String!): User
      createConversation(name: String!, authorId: String!, memberIds: [String!]!): Conversation
    }

    type Query {
      users: [User]
      conversations: [Conversation]
      conversationById(conversationId: String!): Conversation
      conversationsByUserId(userId: String!): [Conversation]
    }

    type User {
      id: ID!
      username: String!
      password: String
      createdAt: Date!
      updatedAt: Date
    }

    type Conversation {
      id: ID!
      name: String
      users: [ConversationUser!]!
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
      createUser: async (
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
          }
        });
      },
      createConversation: async (
        obj: any,
        args: { name: string; authorId: string; memberIds: string[] },
        context: any,
        info: any,
      ) => {
        const { name, authorId, memberIds } = args;

        console.log(args);
        
        
        // Create user
        return prisma.conversation.create({
          include: {
            conversationUsers: true,
          },
          data: {
            name,
            conversationUsers: {
              createMany: {
                data: [
                  { userId: authorId, roleId: 'ADMIN' },
                  ...memberIds.map((id) => ({ userId: id, roleId: 'MEMBER' }))
                ],
              }
            }
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
  
  // Load configuration for Apollo
  const apolloServer = new ApolloServer<MyContext>({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });
  await apolloServer.start();
  app.use(
    path,
    cors<cors.CorsRequest>(),
    json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => ({ token: req.headers.token }),
    }),
  );

  // Start server
  await new Promise<void>((resolve) => httpServer.listen({ port: 4000 }, resolve));
  console.log(`🚀 Server ready at http://localhost:${port}${path}`);
}

startServer()