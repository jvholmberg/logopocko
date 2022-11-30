import { createServer } from "http";
import express from "express";
import { ApolloServer, gql } from "apollo-server-express";

import prisma from "./prisma/client";

const startServer = async () => {
  const app = express()
  const httpServer = createServer(app)

  const typeDefs = gql`
    scalar Date
    scalar DateTime

    type Query {
      logs: [Log]
    }

    type Log {
      id: ID!
      status: Int
      message: String
      stacktrace: String
      createdAt: Date!
    }
  `;

  const resolvers = {
    Query: {
      logs: () => {
        return prisma.log.findMany()
      }
    },
  };
  
  // Load configuration for Apollo
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  })

  // Start Apollo
  await apolloServer.start()
  apolloServer.applyMiddleware({ app });

  // Start Server
  const port = process.env.PORT || 4000;
  httpServer.listen({ port }, () =>
    console.log(`🚀 Server listening at localhost:${port}${apolloServer.graphqlPath}`)
  )
}

startServer()