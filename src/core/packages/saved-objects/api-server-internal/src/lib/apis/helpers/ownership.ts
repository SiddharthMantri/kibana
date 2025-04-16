/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ISavedObjectTypeRegistry,
  ISavedObjectsSecurityExtension,
  SavedObject,
} from '@kbn/core-saved-objects-server';

export class OwnershipHelper {
  private securityExtension?: ISavedObjectsSecurityExtension;
  private typeRegistry?: ISavedObjectTypeRegistry;

  constructor({
    securityExtension,
    typeRegistry,
  }: {
    securityExtension?: ISavedObjectsSecurityExtension;
    typeRegistry?: ISavedObjectTypeRegistry;
  }) {
    this.securityExtension = securityExtension;
    this.typeRegistry = typeRegistry;
  }

  canUserModifyOwnership({ obj }: { obj: SavedObject }): boolean {
    if (this.typeRegistry?.supportsOwnership(obj.type)) {
      const currentUser = this.securityExtension?.getCurrentUser();
      const isOwner = obj.ownership?.owner === currentUser?.profile_uid;
      const isUserAdmin = this.securityExtension?.isCurrentUserAdmin();
      return (isOwner || isUserAdmin) ?? false;
    }
    return false;
  }
}
