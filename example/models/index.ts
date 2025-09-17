import { Sequelize } from 'sequelize';
import { User } from './User';
import { Post } from './Post';

export function initializeModels(sequelize: Sequelize) {
  // Initialize models
  User.initModel(sequelize);
  Post.initModel(sequelize);

  // Set up associations
  Post.associate({ User });
  
  return {
    User,
    Post,
  };
}