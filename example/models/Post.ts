import { DataTypes, Model, Sequelize, BelongsToOptions } from 'sequelize';
import { User } from './User';

export class Post extends Model {
  public id!: number;
  public title!: string;
  public content!: string;
  public userId!: number;
  public published!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;

  // Association
  public user?: User;

  static initModel(sequelize: Sequelize): typeof Post {
    Post.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        title: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id',
          },
        },
        published: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
      },
      {
        sequelize,
        tableName: 'Posts',
        timestamps: true,
      }
    );

    return Post;
  }

  static associate(models: { User: typeof User }) {
    Post.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    } as BelongsToOptions);
  }
}